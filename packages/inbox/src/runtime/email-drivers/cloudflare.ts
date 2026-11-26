import PostalMime from 'postal-mime'
import { z } from 'zod'
import type { InboxNitroApp } from '../../types'
import { notFound } from '@frigear-nu/module-kit/server'
import { randomToken } from '@frigear-nu/module-kit/id'
import { sha256Hex } from '@frigear-nu/module-kit/crypto'
import { defineInboxEmailDriver } from '../utils'
import { inboxEmailPayload } from '../utils/payloads'
import { parsedEmailToPayload } from '../utils/email-inbound'
import { secretsEqual } from '../utils/signature'

// Cloudflare Email Routing: a domain's catch-all (or an address) routes to this Worker, and the `cloudflare-module`
// preset hands every email to the `cloudflare:email` hook, once per recipient (the envelope's `to`). The recipient is
// routed first (`inboxRouteRecipient`): an address nobody has is rejected with a bounce. The raw message is parsed
// (postal-mime), the sender is authenticated from the receiving server's `Authentication-Results`, the files are
// stored (NuxtHub Blob), and the email is stored through this driver's own route in the same Worker
// (`nitroApp.localFetch`), so the inbox hooks get a request event like for any other driver. That route only takes a
// token that lives in this Worker's memory; from outside it is a 404.

/** What the `cloudflare:email` hook carries (Cloudflare's `ForwardableEmailMessage`), as far as the driver reads it. */
type CloudflareEmailMessage = {
  readonly from: string
  readonly to: string
  readonly raw: ReadableStream
  readonly rawSize: number
  setReject: (reason: string) => void
}
type CloudflareEmailHooks = { hook: (name: 'cloudflare:email', handler: (ctx: { message: CloudflareEmailMessage }) => Promise<void>) => unknown }

const ROUTE = '/api/inbox/email/cloudflare'
let instanceToken: string | undefined
/**
 * The token of the hook's own requests: random per Worker instance, never stored or sent anywhere else. Made on first
 * use, since a Worker may not generate random values in global scope (it fails to start).
 */
const internalToken = () => (instanceToken ??= randomToken(32, 'hex'))

const storedAttachment = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().max(255).optional(),
  size: z.number().int().nonnegative().optional(),
  pathname: z.string().startsWith('inbox/email/').max(400).optional(),
})
const internalBody = z.object({
  recipient: z.string().min(3).max(320),
  payload: inboxEmailPayload,
  attachments: z.array(storedAttachment).max(50),
})

async function receive(nitroApp: InboxNitroApp, message: CloudflareEmailMessage): Promise<void> {
  const route = await inboxRouteRecipient(message.to)
  if (route.kind !== 'account') {
    message.setReject('Unknown address')
    return
  }
  const raw = new Uint8Array(await new Response(message.raw).arrayBuffer())
  const parsed = await PostalMime.parse(raw)
  const { payload, attachments } = parsedEmailToPayload(parsed, { fallbackMessageId: `<${(await sha256Hex(raw)).slice(0, 40)}@cloudflare.inbox.invalid>` })
  const stored = await inboxStoreEmailFiles(payload.messageId, attachments)
  const response = await nitroApp.localFetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-inbox-internal': internalToken() },
    body: JSON.stringify({ recipient: message.to, payload, attachments: stored }),
  })
  if (!response.ok) throw new Error(`the inbox refused the email (${response.status}): ${await response.text().catch(() => '')}`)
}

export default defineInboxEmailDriver({
  name: 'cloudflare',
  setup(nitroApp) {
    (nitroApp.hooks as unknown as CloudflareEmailHooks).hook('cloudflare:email', async ({ message }) => {
      try {
        await receive(nitroApp, message)
      }
      catch (error) {
        // The preset runs the hook in `waitUntil`, after the email was accepted: a failure can only be logged.
        console.error('[inbox] could not store an email from Cloudflare Email Routing', error)
      }
    })
  },
  async handler(event) {
    const token = getRequestHeader(event, 'x-inbox-internal')
    if (!token || !(await secretsEqual(token, internalToken()))) throw notFound('This email driver has no webhook.')
    const body = await readValidatedBody(event, internalBody.parse)
    return (await inboxIngestEmail(event, body.payload, { recipients: [body.recipient], attachments: body.attachments })).response
  },
})
