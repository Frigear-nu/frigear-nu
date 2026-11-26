import { apiError, notConfigured, validationError } from '@frigear-nu/module-kit/server'
import { defineInboxEmailDriver } from '../utils'
import { emailRecipients, inboxEmailPayload } from '../utils/payloads'
import { resendEmailToPayload, verifySvixSignature } from '../utils/email-inbound'
import type { ResendReceivedEmail } from '../utils/email-inbound'
import type { InboxAttachment } from '../../types'

// Resend inbound: Resend posts `email.received` to `POST /api/inbox/email/resend`, signed by Svix with the webhook's
// secret (`NUXT_INBOX_RESEND_WEBHOOK_SECRET`). The event only names the email, so the driver fetches it from the Resend
// API (`NUXT_INBOX_RESEND_API_KEY`) with its text, headers and Resend's SPF/DKIM/DMARC verdicts, and its files when it
// has any and NuxtHub Blob is on. Answers 501 until both are set, 401 for a bad signature, 200 for anything stored,
// duplicate or unroutable (Resend stops retrying), and 502 when the Resend API fails (Resend retries).

type ResendEvent = { type?: string, data?: { email_id?: string, received_for?: string[] } }
type ResendAttachmentList = { data?: Array<{ filename?: string | null, content_type?: string | null, download_url?: string | null }> }

const TIMEOUT_MS = 10_000

async function resendGet<T>(url: string, apiKey: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw apiError(502, 'provider_failed', `The Resend API answered ${response.status}.`)
  return await response.json() as T
}

/** The files of a received email, stored with `inboxStoreEmailFiles`; only named when Blob is off. */
async function attachmentsOf(base: string, apiKey: string, email: ResendReceivedEmail & { attachments?: Array<{ filename?: string | null, content_type?: string | null, size?: number | null }> | null }, messageId: string): Promise<InboxAttachment[]> {
  const listed = email.attachments ?? []
  if (!listed.length) return []
  if (!inboxCanStoreAttachments()) {
    return listed.slice(0, 50).map((file, index) => ({ filename: file.filename || `attachment-${index + 1}`, contentType: file.content_type ?? undefined, size: file.size ?? undefined }))
  }
  const list = await resendGet<ResendAttachmentList>(`${base}/emails/receiving/${encodeURIComponent(email.id)}/attachments`, apiKey)
  const files = []
  for (const [index, file] of (list.data ?? []).slice(0, 50).entries()) {
    if (!file.download_url) continue
    const response = await fetch(file.download_url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) throw apiError(502, 'provider_failed', `A Resend attachment answered ${response.status}.`)
    files.push({ filename: file.filename || `attachment-${index + 1}`, contentType: file.content_type || 'application/octet-stream', content: new Uint8Array(await response.arrayBuffer()) })
  }
  return inboxStoreEmailFiles(messageId, files)
}

export default defineInboxEmailDriver({
  name: 'resend',
  async handler(event) {
    const config = inboxConfig(event).resend
    if (!config.webhookSecret || !config.apiKey) throw notConfigured('The Resend inbound driver needs inbox.resend.webhookSecret and inbox.resend.apiKey.')
    const raw = await inboxReadRawBody(event)
    const signed = await verifySvixSignature(config.webhookSecret, {
      id: getRequestHeader(event, 'svix-id'),
      timestamp: getRequestHeader(event, 'svix-timestamp'),
      signature: getRequestHeader(event, 'svix-signature'),
    }, raw)
    if (!signed) throw apiError(401, 'invalid_signature', 'The signature does not match.')
    let body: ResendEvent
    try {
      body = JSON.parse(raw) as ResendEvent
    }
    catch {
      throw validationError([{ path: [], message: 'The body is not JSON.' }], 'Invalid event')
    }
    const id = body.data?.email_id
    if (body.type !== 'email.received' || typeof id !== 'string' || !id) return { status: 'ignored', reason: 'unsupported_event' }

    const base = (config.apiBase || 'https://api.resend.com').replace(/\/+$/, '')
    const email = await resendGet<ResendReceivedEmail>(`${base}/emails/receiving/${encodeURIComponent(id)}`, config.apiKey)
    const parsed = inboxEmailPayload.safeParse(resendEmailToPayload({ ...email, id: email.id || id }))
    if (!parsed.success) throw validationError(parsed.error.issues, 'Invalid email')
    // `To` and `Cc`, and the addresses Resend received it for (a Bcc or a forward).
    const recipients = [...new Set([...emailRecipients(parsed.data), ...(body.data?.received_for ?? []).filter(item => typeof item === 'string').map(item => item.toLowerCase())])]
    let routed = false
    for (const recipient of recipients) {
      if ((await inboxRouteRecipient(recipient, event)).kind === 'account') {
        routed = true
        break
      }
    }
    // Files are only fetched for mail that reaches a mailbox.
    const attachments = routed ? await attachmentsOf(base, config.apiKey, { ...email, id: email.id || id }, parsed.data.messageId) : []
    return (await inboxIngestEmail(event, parsed.data, { recipients, attachments })).response
  },
})
