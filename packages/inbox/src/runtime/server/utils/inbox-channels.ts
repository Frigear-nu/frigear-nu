import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, desc, eq } from 'drizzle-orm'
import { apiError } from '@frigear-nu/module-kit/server'
import { isEmailAddress, metaSendRequest, metaSentId, normaliseEmail, replyCc } from '../../utils/payloads'
import type { InboxMetaChannel } from '../../utils/payloads'
import { formatFromAddress, inboxPlusAddress } from '../../utils/email-routing'
import type { InboxChannelAccountDto, InboxContactDetails, InboxMailboxDto, InboxSendContext, InboxThreadDto } from '../../../types'

// Helpers of the built-in channel adapters (`runtime/channels/*`).

type EmailAccountRef = Pick<InboxChannelAccountDto, 'channel' | 'address' | 'config'>

/** The `Reply-To` of an email account: `config.replyTo`, else its own address. */
export function inboxReplyToAddress(account: EmailAccountRef | null): string | undefined {
  if (!account) return undefined
  const replyTo = typeof account.config.replyTo === 'string' ? account.config.replyTo : undefined
  return replyTo || (account.channel === 'email' ? account.address : undefined)
}

/**
 * The `Reply-To` of a reply in a thread: the thread's reply address (`support+ibt_...@inbox.example.org`) when
 * `address` is on an inbox domain, so the answer finds its thread whatever its subject; `address` itself otherwise.
 */
export function inboxThreadReplyTo(address: string | undefined, threadId: string, event?: H3Event): string | undefined {
  if (!address) return undefined
  return inboxIsOnDomain(address, event) ? inboxPlusAddress(address, threadId) : address
}

/**
 * The email account a mailbox is answered from, for threads that did not come in by email: its first enabled email
 * account on an inbox domain, else its first enabled email account.
 */
export async function inboxMailboxEmailAccount(mailboxId: string, event?: H3Event): Promise<EmailAccountRef | undefined> {
  const rows = await db.select({ channel: schema.inboxChannelAccounts.channel, address: schema.inboxChannelAccounts.address, config: schema.inboxChannelAccounts.config }).from(schema.inboxChannelAccounts)
    .where(and(eq(schema.inboxChannelAccounts.mailboxId, mailboxId), eq(schema.inboxChannelAccounts.channel, 'email'), eq(schema.inboxChannelAccounts.enabled, true)))
    .orderBy(asc(schema.inboxChannelAccounts.createdAt))
  const accounts = rows.map(row => ({ ...row, config: (row.config ?? {}) as Record<string, unknown> }))
  return accounts.find(account => inboxIsOnDomain(account.address, event)) ?? accounts[0]
}

/** The address a mailbox is answered at: the `Reply-To` of its email account (`inboxMailboxEmailAccount`). */
export async function inboxMailboxEmailAddress(mailboxId: string, event?: H3Event): Promise<string | undefined> {
  return inboxReplyToAddress((await inboxMailboxEmailAccount(mailboxId, event)) ?? null)
}

/**
 * The `From` of a reply sent from an email account: `"<Mailbox name>" <address>` when the account has
 * `config.sendFromAddress`, else `undefined` (Notify's `from`, the platform's address).
 */
export function inboxEmailFrom(account: EmailAccountRef | null | undefined, mailbox: Pick<InboxMailboxDto, 'name' | 'key'>): string | undefined {
  if (!account || account.channel !== 'email' || account.config.sendFromAddress !== true) return undefined
  const address = normaliseEmail(account.address)
  if (!isEmailAddress(address)) return undefined
  const name = typeof mailbox.name === 'string' ? mailbox.name : mailbox.name.en ?? Object.values(mailbox.name)[0]
  return formatFromAddress(name || mailbox.key, address)
}

/** The subject of a reply: `Re: <subject> [ibt_...]`, so an answer threads back by its subject. */
export function inboxReplySubject(thread: Pick<InboxThreadDto, 'id' | 'subject'>): string {
  return `Re: ${inboxCleanSubject(thread.subject) || 'Your message'} [${thread.id}]`
}

/**
 * The address a reply to the contact goes to: their email (or the email they wrote from) when it is one plain valid
 * address, checked like cc recipients (`isEmailAddress`): a list (`a@x.org, b@y.org`) or a value with a line break is
 * not one. `null` otherwise.
 */
export function inboxReplyAddress(contact: Pick<InboxContactDetails, 'email' | 'channel' | 'externalId'>): string | null {
  const raw = contact.email ?? (contact.channel === 'email' ? contact.externalId : null)
  if (!raw) return null
  const address = normaliseEmail(raw)
  return isEmailAddress(address) ? address : null
}

/**
 * The threading headers of a reply: `In-Reply-To` and `References` naming the latest email the person sent in the
 * thread, so their mail client files the reply with it. None for a thread without an inbound email.
 */
export async function inboxReplyHeaders(threadId: string): Promise<Record<string, string>> {
  const messageId = await inboxLatestInboundMessageId(threadId)
  return messageId ? { 'In-Reply-To': messageId, 'References': messageId } : {}
}

/**
 * Sends a reply by email to the contact (`409 no_reply_address` when they left no valid address, see
 * `inboxReplyAddress`), copying the people their last authenticated email copied (`inboxReplyCc`), as a reply-all
 * would, with the `In-Reply-To` and `References` of their latest email (`inboxReplyHeaders`). `from` replaces
 * Notify's sender (`inboxEmailFrom`).
 */
export async function inboxSendEmailReply(input: { thread: InboxThreadDto, contact: InboxContactDetails, body: string, replyTo?: string, from?: string }): Promise<{ cc: string[] }> {
  const to = inboxReplyAddress(input.contact)
  if (!to) throw apiError(409, 'no_reply_address', 'The contact left no valid email address to reply to.')
  const cc = await inboxReplyCc(input.thread.id, [to, input.replyTo, input.from])
  const headers = await inboxReplyHeaders(input.thread.id)
  await dispatchEmailNotification({
    to,
    ...(cc.length ? { cc } : {}),
    ...(input.from ? { from: input.from } : {}),
    subject: inboxReplySubject(input.thread),
    body: inboxTextToHtml(input.body),
    text: input.body,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    meta: { inboxThreadId: input.thread.id },
  })
  return { cc }
}

/**
 * The `Cc` of an email reply in a thread: the cc recipients stored with the thread's latest authenticated inbound
 * message (what the person's last verified email copied: the cc of an email with a forged sender is never sent to),
 * without our own addresses: every email account's address and `config.replyTo`, any address on an inbox domain (a
 * reply address), the notify sender, and `exclude` (the recipient, the reply's `Reply-To` and `From`). Empty when the
 * person copied nobody.
 */
export async function inboxReplyCc(threadId: string, exclude: ReadonlyArray<string | null | undefined>): Promise<string[]> {
  const [latest] = await db.select({ cc: schema.inboxMessages.cc }).from(schema.inboxMessages)
    .where(and(eq(schema.inboxMessages.threadId, threadId), eq(schema.inboxMessages.direction, 'in'), eq(schema.inboxMessages.authenticated, true)))
    .orderBy(desc(schema.inboxMessages.createdAtMs)).limit(1)
  if (!latest?.cc?.length) return []
  const accounts = await db.select({ address: schema.inboxChannelAccounts.address, config: schema.inboxChannelAccounts.config })
    .from(schema.inboxChannelAccounts).where(eq(schema.inboxChannelAccounts.channel, 'email'))
  const from = (useRuntimeConfig() as { notify?: { email?: { from?: string } } }).notify?.email?.from
  return replyCc(latest.cc, [
    ...exclude,
    from,
    ...accounts.flatMap(account => [account.address, typeof account.config?.replyTo === 'string' ? account.config.replyTo : null]),
  ]).filter(email => !inboxIsOnDomain(email))
}

/**
 * Sends a reply through the Graph API (WhatsApp Cloud API, Messenger, Instagram) with the account's access token,
 * within `inbox.meta.timeoutMs`. WhatsApp only delivers free text within 24 hours of the person's last message;
 * outside that window the API refuses it and the reply fails with `delivery_failed`.
 */
export async function inboxMetaSend(channel: InboxMetaChannel, ctx: InboxSendContext): Promise<{ externalId: string | null }> {
  if (!ctx.account) throw apiError(409, 'channel_unavailable', 'The channel account of this thread was deleted.')
  if (!ctx.secret) throw apiError(409, 'channel_not_configured', `The access token of this ${channel} account is not configured (secretRef).`)
  const meta = inboxConfig(ctx.event).meta
  const { url, body } = metaSendRequest(channel, {
    apiBase: meta.apiBase,
    apiVersion: meta.apiVersion,
    accountId: ctx.account.address,
    recipient: ctx.contact.externalId,
    text: ctx.message.body,
  })
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${ctx.secret}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(meta.timeoutMs),
  })
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (json as { error?: { message?: string } } | null)?.error?.message
    throw new Error(`Graph API ${response.status}${error ? `: ${error}` : ''}`)
  }
  return { externalId: metaSentId(json) }
}
