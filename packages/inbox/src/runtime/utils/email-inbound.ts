import type { Address, Email as ParsedEmail, Header } from 'postal-mime'
import { hmacSha256Hex, timingSafeEqual } from '@frigear-nu/module-kit/crypto'
import { emailRecipients, htmlToText, INBOX_MAX_BODY } from './payloads'
import type { InboxEmailPayload } from './payloads'
import { emailDomainOf, parsePlusAddress } from './email-routing'

// The built-in inbound email drivers' mappings: a parsed MIME message (Cloudflare Email Routing) and a received email of
// the Resend API, both into the provider-agnostic `InboxEmailPayload`, and the Svix signature of Resend's webhooks.
// Pure functions, so they are unit tested without a server.

// --- Authentication-Results ------------------------------------------------------------------------------------------

/** Whether `domain` is `fromDomain` or a parent of it (relaxed DMARC alignment: `mail.example.org` aligns with `example.org`). */
function aligned(fromDomain: string, domain: string | undefined): boolean {
  const d = (domain ?? '').trim().toLowerCase().replace(/\.$/, '')
  // A bare top-level domain (`org`) aligns with nothing.
  if (!d || !fromDomain || !d.includes('.')) return false
  return fromDomain === d || fromDomain.endsWith(`.${d}`) || d.endsWith(`.${fromDomain}`)
}

/**
 * Whether the receiving server's `Authentication-Results` (RFC 8601) say the `From` address is genuine: DMARC passed
 * for the From domain, or DKIM passed with a signing domain (`header.d`) aligned with it, or SPF passed for an aligned
 * envelope sender (`smtp.mailfrom`). Only the topmost header counts, and only when the receiving server wrote it (its
 * authserv-id is one of `authservIds`, when given): the receiving server adds it on top, and the ones below came with
 * the message, written by anyone. Anything else (no header, a failure, a domain that is not the From domain) is
 * `false`.
 */
export function authenticatedFromResults(results: readonly string[], fromAddress: string, authservIds?: readonly string[]): boolean {
  const top = results[0]
  if (!top) return false
  if (authservIds && !authservIds.includes(top.split(';')[0]!.trim().split(/\s+/)[0]!.toLowerCase())) return false
  const fromDomain = emailDomainOf(fromAddress)
  if (!fromDomain) return false
  // `authserv-id; method=result prop=value ...; method=result ...`: comments in parentheses dropped.
  const clauses = top.replace(/\([^)]*\)/g, ' ').split(';').slice(1)
  for (const clause of clauses) {
    const match = /^\s*([a-z0-9-]+)\s*=\s*([a-z]+)\b(.*)$/is.exec(clause)
    if (!match) continue
    const method = match[1]!.toLowerCase()
    const result = match[2]!.toLowerCase()
    if (result !== 'pass') continue
    const props = new Map<string, string>()
    for (const prop of match[3]!.matchAll(/([a-z0-9-]+\.[a-z0-9-]+)\s*=\s*("[^"]*"|[^\s;]+)/gi)) props.set(prop[1]!.toLowerCase(), prop[2]!.replace(/^"|"$/g, ''))
    if (method === 'dmarc' && aligned(fromDomain, props.get('header.from'))) return true
    if (method === 'dkim' && aligned(fromDomain, props.get('header.d') ?? emailDomainOf(props.get('header.i') ?? ''))) return true
    if (method === 'spf') {
      const mailfrom = props.get('smtp.mailfrom')
      if (mailfrom && aligned(fromDomain, mailfrom.includes('@') ? emailDomainOf(mailfrom) : mailfrom)) return true
    }
  }
  return false
}

// --- Cloudflare Email Routing (raw MIME) --------------------------------------------------------------------------------

const mailboxesOf = (list: Address[] | undefined) => (list ?? []).flatMap(entry => entry.group ? entry.group : [entry]).filter(entry => !!entry.address)
const headerValues = (headers: Header[], key: string) => headers.filter(header => header.key === key).map(header => header.value)

/** An attachment of a parsed message: what a driver stores, and the bytes. */
export type InboxMimeAttachment = { filename: string, contentType: string, content: Uint8Array }

/** The authserv-id Cloudflare Email Routing writes its `Authentication-Results` with. */
export const CLOUDFLARE_AUTHSERV_IDS = ['mx.cloudflare.net']
/** The authserv-id Gmail writes its `Authentication-Results` with. */
export const GMAIL_AUTHSERV_IDS = ['mx.google.com']

/** Authserv-ids from a comma separated list or an array (`NUXT_INBOX_CLOUDFLARE_AUTHSERV_IDS`), lower case, once each. */
export function parseAuthservIds(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(list.filter((item): item is string => typeof item === 'string').map(item => item.trim().toLowerCase()).filter(item => /^[\w.-]+$/.test(item)))]
}

/**
 * A MIME message parsed by `postal-mime` as an email payload. `fallbackMessageId` is used when the message has no
 * `Message-ID` (a hash of the raw message, so a redelivery is still stored once). The sender is authenticated by the
 * `Authentication-Results` of `authservIds` (Cloudflare's by default). The body is kept as text only. The
 * attachments are returned apart, with their bytes, for the driver to store.
 */
export function parsedEmailToPayload(email: ParsedEmail, options: { fallbackMessageId: string, authservIds?: readonly string[] }): { payload: InboxEmailPayload, attachments: InboxMimeAttachment[] } {
  const from = mailboxesOf(email.from ? [email.from] : [])[0]
  const fromAddress = from?.address ?? ''
  const to = mailboxesOf(email.to).map(entry => ({ email: entry.address!, name: entry.name || null }))
  const cc = mailboxesOf(email.cc).map(entry => ({ email: entry.address!, name: entry.name || null }))
  const attachments = email.attachments
    .filter(file => file.disposition !== 'inline' || !!file.filename)
    .slice(0, 50)
    .map((file, index) => ({
      filename: (file.filename || `attachment-${index + 1}`).slice(0, 255),
      contentType: file.mimeType || 'application/octet-stream',
      content: typeof file.content === 'string' ? new TextEncoder().encode(file.content) : new Uint8Array(file.content),
    }))
  return {
    payload: {
      messageId: (email.messageId?.trim() || options.fallbackMessageId).slice(0, 998),
      from: { email: fromAddress, name: from?.name || null },
      to: to.length ? to : [{ email: fromAddress, name: null }],
      cc: cc.length ? cc : null,
      subject: email.subject ?? null,
      // Only the text is kept (the HTML as text when there is none), so the message stays small on its way in.
      text: (email.text?.trim() || (email.html ? htmlToText(email.html) : '')).slice(0, INBOX_MAX_BODY),
      html: null,
      inReplyTo: email.inReplyTo ?? null,
      references: email.references ?? null,
      authenticated: authenticatedFromResults(headerValues(email.headers, 'authentication-results'), fromAddress, options.authservIds ?? CLOUDFLARE_AUTHSERV_IDS),
    },
    attachments,
  }
}

/**
 * The recipients of a message fetched from one account's mailbox (Gmail, IMAP): the account's address, and the
 * addresses of `To`/`Cc` that are it or a plus address of it (a reply address names its thread). Other recipients are
 * left out: their own mailboxes take the message in.
 */
export function mailboxRecipients(payload: InboxEmailPayload, accountAddress: string): string[] {
  const own = accountAddress.trim().toLowerCase()
  return [...new Set([...emailRecipients(payload).filter(address => parsePlusAddress(address).base === own), own])]
}

// --- Resend -----------------------------------------------------------------------------------------------------------

/** The fields of a received email (`GET /emails/receiving/:id` of the Resend API) the inbox reads. */
export type ResendReceivedEmail = {
  id: string
  from: string
  to?: string[] | null
  cc?: string[] | null
  subject?: string | null
  text?: string | null
  html?: string | null
  message_id?: string | null
  headers?: Record<string, string | string[]> | null
  /** Resend's own verdicts: `pass`, `fail`, `gray`, `processing_failed` or `unknown`. */
  authentication?: { spf?: string | null, dkim?: string | null, dmarc?: string | null } | null
}

/**
 * A Resend received email as an email payload. The sender is authenticated when Resend's receiving server saw DMARC
 * or DKIM pass (`authentication`; a DKIM pass means a signature of the From domain). SPF alone is not enough: it checks
 * the envelope sender, not the From address. Without `authentication` (older emails) it is unauthenticated.
 */
export function resendEmailToPayload(email: ResendReceivedEmail): InboxEmailPayload {
  const header = (name: string) => {
    const value = email.headers?.[name]
    return Array.isArray(value) ? value.join(' ') : value ?? null
  }
  const auth = email.authentication
  return {
    messageId: (email.message_id?.trim() || `resend:${email.id}`).slice(0, 998),
    from: email.from,
    to: email.to?.length ? email.to : email.from,
    cc: email.cc?.length ? email.cc : null,
    subject: email.subject ?? null,
    text: email.text ?? null,
    html: email.html ?? null,
    inReplyTo: header('in-reply-to'),
    references: header('references'),
    authenticated: auth?.dmarc === 'pass' || auth?.dkim === 'pass',
  }
}

/** The headers of a Svix-signed webhook (Resend): `svix-id`, `svix-timestamp` (seconds) and `svix-signature`. */
export type SvixHeaders = { id: string | null | undefined, timestamp: string | null | undefined, signature: string | null | undefined }

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  }
  catch {
    return null
  }
}

const bytesToHex = (bytes: Uint8Array) => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

/**
 * Whether a Svix-signed webhook is genuine: `svix-signature` holds a `v1,<base64>` HMAC-SHA256 of
 * `<svix-id>.<svix-timestamp>.<raw body>` with the secret (`whsec_<base64 key>`), and the timestamp is within
 * `toleranceSeconds` (5 minutes) of `now`, so an old request cannot be replayed. An empty secret never verifies.
 */
export async function verifySvixSignature(secret: string | undefined, headers: SvixHeaders, body: string, now = Date.now(), toleranceSeconds = 300): Promise<boolean> {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false
  const timestamp = Number(headers.timestamp)
  if (!Number.isInteger(timestamp) || Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false
  const key = base64ToBytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret)
  if (!key?.length) return false
  const expected = await hmacSha256Hex(key, `${headers.id}.${headers.timestamp}.${body}`)
  for (const entry of headers.signature.split(' ')) {
    const [version, value] = entry.split(',', 2)
    if (version !== 'v1' || !value) continue
    const given = base64ToBytes(value)
    if (given && timingSafeEqual(bytesToHex(given), expected)) return true
  }
  return false
}

/** Signs a body the way Svix does: the `svix-signature` value (`v1,<base64>`), for tests and local tools. */
export async function signSvix(secret: string, id: string, timestamp: number | string, body: string): Promise<string> {
  const key = base64ToBytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret)!
  const hex = await hmacSha256Hex(key, `${id}.${timestamp}.${body}`)
  const bytes = Uint8Array.from(hex.match(/../g)!.map(pair => Number.parseInt(pair, 16)))
  return `v1,${btoa(String.fromCharCode(...bytes))}`
}
