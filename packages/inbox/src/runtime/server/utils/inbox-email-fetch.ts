import type { H3Event } from 'h3'
import PostalMime from 'postal-mime'
import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { and, eq, inArray } from 'drizzle-orm'
import { randomToken } from '@frigear-nu/module-kit/id'
import { sha256Hex } from '@frigear-nu/module-kit/crypto'
import { inboxEmailPayload } from '../../utils/payloads'
import type { InboxEmailPayload } from '../../utils/payloads'
import { mailboxRecipients, parsedEmailToPayload } from '../../utils/email-inbound'
import { messageIdExternalIds, normaliseMessageId } from '../../utils/email-routing'
import { secretsEqual } from '../../utils/signature'
import type { InboxAttachment } from '../../../types'
import type { InboxChannelAccountRow } from './inbox-dto'

// Raw inbound email of the drivers that receive or fetch the message themselves (Cloudflare Email Routing, Gmail,
// IMAP): parse it, store its files only when a mailbox will keep it, and store it, from a request or from a task. A task
// (the Gmail catch-up, the IMAP poll) has no request event, so the email goes through the driver's own route in the
// same server (`nitroApp.localFetch`) with a token that only lives in this server's memory: the inbox hooks then get a
// request event as for any other driver. From outside, that route is a 404 (or the driver's own webhook).
// Also where those drivers keep their place per email account (`inbox_email_cursors`).

let instanceToken: string | undefined
/** The token of the server's own ingest requests: random per instance, made on first use (never in global scope). */
function internalToken(): string {
  return (instanceToken ??= randomToken(32, 'hex'))
}

const HEADER = 'x-inbox-internal'

/** Whether a request is the server's own ingest request (`inboxDeliverRawEmail` from a task or a hook). */
export async function inboxIsInternalEmailRequest(event: H3Event): Promise<boolean> {
  const token = getRequestHeader(event, HEADER)
  return !!token && await secretsEqual(token, internalToken())
}

const storedAttachment = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().max(255).optional(),
  size: z.number().int().nonnegative().optional(),
  pathname: z.string().startsWith('inbox/email/').max(400).optional(),
})
const internalBody = z.object({
  recipients: z.array(z.string().min(3).max(320)).min(1).max(100),
  payload: inboxEmailPayload,
  attachments: z.array(storedAttachment).max(50),
})

/** Stores the email of an internal ingest request (check `inboxIsInternalEmailRequest` first). */
export async function inboxHandleInternalEmail(event: H3Event) {
  const body = await readValidatedBody(event, internalBody.parse)
  return (await inboxIngestEmail(event, body.payload, { recipients: body.recipients, attachments: body.attachments })).response
}

/**
 * The recipients of a message fetched from one account's mailbox (Gmail, IMAP): see `mailboxRecipients`.
 */
export function inboxMailboxRecipients(payload: InboxEmailPayload, accountAddress: string): string[] {
  return mailboxRecipients(payload, accountAddress)
}

/**
 * Whether any account among the recipients would store this Message-ID: one that has neither a message with it nor a
 * tombstone for it (retention or an erase removed it). The files of a duplicate or a removed message are not stored.
 */
async function wantsFiles(messageId: string, recipients: readonly string[], event?: H3Event): Promise<boolean> {
  const accounts: InboxChannelAccountRow[] = []
  for (const recipient of recipients) {
    const route = await inboxRouteRecipient(recipient, event)
    if (route.kind === 'account' && route.account.enabled && !accounts.some(account => account.id === route.account.id)) accounts.push(route.account)
  }
  if (!accounts.length) return false
  const id = normaliseMessageId(messageId)
  const externalIds = id ? messageIdExternalIds('email', id) : [`email:${messageId}`]
  for (const account of accounts) {
    const [stored] = await db.select({ id: schema.inboxMessages.id }).from(schema.inboxMessages)
      .where(and(eq(schema.inboxMessages.channelAccountId, account.id), inArray(schema.inboxMessages.externalId, externalIds))).limit(1)
    if (stored) continue
    if (await inboxIsTombstoned(account.id, `email:${messageId}`)) continue
    return true
  }
  return false
}

/**
 * Stores a raw RFC 5322 email for `recipients`: parses it (postal-mime), authenticates the sender by the topmost
 * `Authentication-Results` of `authservIds`, stores its files (only when an account will keep the message) and stores
 * it, directly with a request `event`, else through the driver's own route (`POST /api/inbox/email/<driver>`, with the
 * internal token). Throws when the inbox refuses it, so the caller retries.
 */
export async function inboxDeliverRawEmail(input: { driver: string, raw: Uint8Array, recipients: string[] | ((payload: InboxEmailPayload) => string[]), authservIds: readonly string[], event?: H3Event }) {
  const parsed = await PostalMime.parse(input.raw)
  const fallbackMessageId = `<${(await sha256Hex(input.raw)).slice(0, 40)}@${input.driver}.inbox.invalid>`
  const { payload, attachments } = parsedEmailToPayload(parsed, { fallbackMessageId, authservIds: input.authservIds })
  const recipients = typeof input.recipients === 'function' ? input.recipients(payload) : input.recipients
  const stored: InboxAttachment[] = attachments.length && await wantsFiles(payload.messageId, recipients, input.event)
    ? await inboxStoreEmailFiles(payload.messageId, attachments)
    : attachments.map(file => ({ filename: file.filename, contentType: file.contentType, size: file.content.byteLength }))
  if (input.event) return (await inboxIngestEmail(input.event, payload, { recipients, attachments: stored })).response
  const response = await useNitroApp().localFetch(`/api/inbox/email/${input.driver}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [HEADER]: internalToken() },
    body: JSON.stringify({ recipients, payload, attachments: stored }),
  })
  if (!response.ok) throw new Error(`the inbox refused the email (${response.status}): ${await response.text().catch(() => '')}`)
  return await response.json() as Awaited<ReturnType<typeof inboxIngestEmail>>['response']
}

// --- Cursors ----------------------------------------------------------------------------------------------------------

/** The enabled email accounts a fetching driver reads: `config.inbound` names it. */
export async function inboxEmailAccountsFor(driver: string): Promise<InboxChannelAccountRow[]> {
  const rows = await db.select().from(schema.inboxChannelAccounts)
    .where(and(eq(schema.inboxChannelAccounts.channel, 'email'), eq(schema.inboxChannelAccounts.enabled, true)))
  return rows.filter(row => (row.config as Record<string, unknown> | null)?.inbound === driver)
}

/** Where a driver left off in an account's mailbox (`{}` the first time). */
export async function inboxEmailCursor<T extends Record<string, unknown>>(driver: string, channelAccountId: string): Promise<Partial<T>> {
  const [row] = await db.select({ state: schema.inboxEmailCursors.state }).from(schema.inboxEmailCursors)
    .where(eq(schema.inboxEmailCursors.key, `${driver}:${channelAccountId}`)).limit(1)
  return (row?.state ?? {}) as Partial<T>
}

/** Stores where a driver left off in an account's mailbox. */
export async function inboxSaveEmailCursor(driver: string, channelAccountId: string, state: Record<string, unknown>): Promise<void> {
  const now = new Date()
  await db.insert(schema.inboxEmailCursors)
    .values({ key: `${driver}:${channelAccountId}`, channelAccountId, driver, state, updatedAt: now })
    .onConflictDoUpdate({ target: schema.inboxEmailCursors.key, set: { state, updatedAt: now } })
}
