import { z } from 'zod'
import type { InboxAttachment, InboxInboundMessage } from '../../types'

// Webhook payloads, parsed into `InboxInboundMessage`s. Pure functions, so they are unit tested without a server.

/** Longest message body stored; longer ones are cut. */
export const INBOX_MAX_BODY = 50_000

const clip = (value: string) => value.length > INBOX_MAX_BODY ? value.slice(0, INBOX_MAX_BODY) : value

const address = z.union([
  z.string().trim().min(3),
  z.object({ email: z.string().trim().min(3), name: z.string().trim().nullish() }),
])

const attachment = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().max(255).optional(),
  size: z.number().int().nonnegative().optional(),
  url: z.url().optional(),
})

/**
 * The provider-agnostic JSON of `POST /api/inbox/webhooks/email`. An inbound-email provider (Postmark, Mailgun,
 * SendGrid, Cloudflare Email Workers, ...) is pointed at it through a small mapping, so the inbox depends on none.
 */
export const inboxEmailPayload = z.object({
  /** The provider's `Message-ID`: a retry with the same id is stored once. */
  messageId: z.string().trim().min(1).max(998),
  from: address,
  to: z.union([address, z.array(address).min(1)]),
  /** The `Cc` recipients, stored with the message and shown to staff with `inbox:pii`. */
  cc: z.union([address, z.array(address).max(100)]).nullish(),
  subject: z.string().max(998).nullish(),
  text: z.string().nullish(),
  html: z.string().nullish(),
  attachments: z.array(attachment).max(50).optional(),
  /**
   * The provider's verdict that the sender is who they say (SPF, DKIM or DMARC passed). Without it the email always
   * starts a new thread: a forged sender cannot write into someone else's conversation.
   */
  authenticated: z.boolean().optional(),
})
export type InboxEmailPayload = z.infer<typeof inboxEmailPayload>

const emailOf = (value: z.infer<typeof address>) => (typeof value === 'string' ? value : value.email)
const nameOf = (value: z.infer<typeof address>) => (typeof value === 'string' ? null : value.name ?? null)

/** `Kari <kari@example.com>` -> `kari@example.com`, lower case. */
export function normaliseEmail(value: string): string {
  const angled = /<([^<>]+)>/.exec(value)
  return (angled ? angled[1]! : value).trim().toLowerCase()
}

/** The display name of `Kari Nordmann <kari@example.com>`, or `null`. */
export function displayNameOf(value: string): string | null {
  const index = value.indexOf('<')
  if (index <= 0 || !value.trimEnd().endsWith('>')) return null
  const name = value.slice(0, index).trim().replace(/^"|"$/g, '').trim()
  return name || null
}

/** The thread id an email answers, from the `[ibt_...]` marker replies carry in their subject. */
export function threadIdFromSubject(subject: string | null | undefined): string | null {
  const match = /\[(ibt_[a-z0-9]{8,64})\]/i.exec(subject ?? '')
  return match ? match[1]!.toLowerCase() : null
}

/** A subject without the `[ibt_...]` marker and leading `Re:`/`Fwd:`/`SV:` prefixes. */
export function cleanSubject(subject: string | null | undefined): string | null {
  const cleaned = (subject ?? '')
    .replace(/\[ibt_[a-z0-9]{8,64}\]/gi, '')
    .replace(/^\s*((re|fwd?|sv|vs|aw)\s*:\s*)+/i, '')
    .trim()
  return cleaned || null
}

/** Plain text of an HTML body: tags dropped, entities of the common characters decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The recipients of an email payload, lower case. */
export function emailRecipients(payload: InboxEmailPayload): string[] {
  const list = Array.isArray(payload.to) ? payload.to : [payload.to]
  return list.map(entry => normaliseEmail(emailOf(entry)))
}

/** The `Cc` recipients of an email payload, lower case, without `exclude` (the mailbox's own address) or repeats. */
export function emailCc(payload: InboxEmailPayload, exclude?: string): string[] {
  const list = payload.cc ? (Array.isArray(payload.cc) ? payload.cc : [payload.cc]) : []
  const skip = exclude ? normaliseEmail(exclude) : undefined
  return [...new Set(list.map(entry => normaliseEmail(emailOf(entry))))].filter(email => email && email !== skip)
}

/**
 * The `Cc` of a reply: the stored cc recipients of the message being answered, lower case, without repeats and without
 * any of `own` (the inbox's own addresses and the person the reply goes to), so a reply never copies one of our
 * mailboxes back into the inbox.
 */
export function replyCc(stored: readonly string[] | null | undefined, own: ReadonlyArray<string | null | undefined>): string[] {
  const skip = new Set(own.filter((value): value is string => !!value).map(normaliseEmail))
  return [...new Set((stored ?? []).map(normaliseEmail))].filter(email => email && !skip.has(email))
}

/** An email payload as an inbound message for the account at `address`. */
export function emailToInbound(payload: InboxEmailPayload, accountAddress: string): InboxInboundMessage {
  const from = emailOf(payload.from)
  const email = normaliseEmail(from)
  const body = payload.text?.trim() || (payload.html ? htmlToText(payload.html) : '')
  return {
    address: accountAddress,
    contact: { externalId: email, email, name: nameOf(payload.from) ?? displayNameOf(from) },
    externalId: payload.messageId,
    subject: cleanSubject(payload.subject),
    authenticated: payload.authenticated === true,
    body: clip(body),
    attachments: (payload.attachments ?? []).map(file => ({ filename: file.filename, contentType: file.contentType, size: file.size, url: file.url })),
    cc: emailCc(payload, accountAddress),
    threadId: threadIdFromSubject(payload.subject),
  }
}

// --- Meta ----------------------------------------------------------------------------------------------------------------

/** The channels behind the Meta webhook. */
export type InboxMetaChannel = 'whatsapp' | 'messenger' | 'instagram'
export type InboxMetaInbound = InboxInboundMessage & { channel: InboxMetaChannel }

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)

/** A WhatsApp message's text, or a placeholder naming its type (media is not downloaded). */
function whatsappBody(message: Json): { body: string, attachments: InboxAttachment[] } {
  const type = str(message.type) ?? 'unknown'
  if (type === 'text' && isObject(message.text)) return { body: str(message.text.body) ?? '', attachments: [] }
  if (type === 'button' && isObject(message.button)) return { body: str(message.button.text) ?? '', attachments: [] }
  if (type === 'interactive' && isObject(message.interactive)) {
    const reply = isObject(message.interactive.button_reply) ? message.interactive.button_reply : isObject(message.interactive.list_reply) ? message.interactive.list_reply : undefined
    return { body: str(reply?.title) ?? '[interactive]', attachments: [] }
  }
  const media = isObject(message[type]) ? message[type] as Json : undefined
  const caption = str(media?.caption) ?? ''
  const attachments: InboxAttachment[] = media
    ? [{ filename: str(media.filename) ?? `${type}${str(media.id) ? `-${str(media.id)}` : ''}`, contentType: str(media.mime_type) }]
    : []
  return { body: caption || `[${type}]`, attachments }
}

/** A Messenger or Instagram message's text, with links to its attachments. */
function messagingBody(message: Json): { body: string, attachments: InboxAttachment[] } {
  const attachments: InboxAttachment[] = list(message.attachments).filter(isObject).map((item, index) => {
    const payload = isObject(item.payload) ? item.payload : {}
    return { filename: `${str(item.type) ?? 'file'}-${index + 1}`, url: str(payload.url) }
  })
  const text = str(message.text) ?? ''
  return { body: text || (attachments.length ? `[${attachments.map(item => item.filename).join(', ')}]` : ''), attachments }
}

/**
 * The messages in a Meta webhook body: WhatsApp Cloud API (`object: 'whatsapp_business_account'`), Messenger
 * (`object: 'page'`) and Instagram (`object: 'instagram'`). Delivery and read statuses, echoes of our own replies and
 * anything unknown are skipped. `address` is the account the message arrived on: the WhatsApp phone number id, the
 * page id or the Instagram account id.
 */
export function parseMetaWebhook(body: unknown): InboxMetaInbound[] {
  if (!isObject(body)) return []
  const out: InboxMetaInbound[] = []
  if (body.object === 'whatsapp_business_account') {
    for (const entry of list(body.entry).filter(isObject)) {
      for (const change of list(entry.changes).filter(isObject)) {
        const value = isObject(change.value) ? change.value : undefined
        const phoneNumberId = str(isObject(value?.metadata) ? value.metadata.phone_number_id : undefined)
        if (!value || !phoneNumberId) continue
        const names = new Map(list(value.contacts).filter(isObject).map(contact => [str(contact.wa_id), str(isObject(contact.profile) ? contact.profile.name : undefined)]))
        for (const message of list(value.messages).filter(isObject)) {
          const from = str(message.from)
          const id = str(message.id)
          if (!from || !id) continue
          const { body: text, attachments } = whatsappBody(message)
          out.push({
            channel: 'whatsapp',
            address: phoneNumberId,
            contact: { externalId: from, phone: `+${from.replace(/^\+/, '')}`, name: names.get(from) ?? null },
            externalId: id,
            body: clip(text),
            attachments,
            authenticated: true,
          })
        }
      }
    }
    return out
  }
  if (body.object === 'page' || body.object === 'instagram') {
    const channel: InboxMetaChannel = body.object === 'page' ? 'messenger' : 'instagram'
    for (const entry of list(body.entry).filter(isObject)) {
      for (const event of list(entry.messaging).filter(isObject)) {
        const message = isObject(event.message) ? event.message : undefined
        const sender = str(isObject(event.sender) ? event.sender.id : undefined)
        const recipient = str(isObject(event.recipient) ? event.recipient.id : undefined) ?? str(entry.id)
        const id = str(message?.mid)
        if (!message || !sender || !recipient || !id || message.is_echo === true) continue
        const { body: text, attachments } = messagingBody(message)
        out.push({ channel, address: recipient, contact: { externalId: sender }, externalId: id, body: clip(text), attachments, authenticated: true })
      }
    }
  }
  return out
}

/** The Graph API call that sends `text` to `recipient` from the account `accountId` (a phone number id or page id). */
export function metaSendRequest(channel: InboxMetaChannel, options: { apiBase: string, apiVersion: string, accountId: string, recipient: string, text: string }): { url: string, body: Record<string, unknown> } {
  const url = `${options.apiBase.replace(/\/+$/, '')}/${options.apiVersion}/${encodeURIComponent(options.accountId)}/messages`
  if (channel === 'whatsapp') {
    return { url, body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: options.recipient, type: 'text', text: { preview_url: false, body: options.text } } }
  }
  return { url, body: { recipient: { id: options.recipient }, messaging_type: 'RESPONSE', message: { text: options.text } } }
}

/** The id of the sent message in a Graph API response (`messages[0].id` for WhatsApp, `message_id` otherwise). */
export function metaSentId(response: unknown): string | null {
  if (!isObject(response)) return null
  const first = list(response.messages).find(isObject)
  return str(first?.id) ?? str(response.message_id) ?? null
}
