import { db, schema } from '@nuxthub/db'
import { and, asc, eq } from 'drizzle-orm'
import { apiError } from '@frigear-nu/module-kit/server'
import { metaSendRequest, metaSentId } from '../../utils/payloads'
import type { InboxMetaChannel } from '../../utils/payloads'
import type { InboxChannelAccountDto, InboxContactDetails, InboxSendContext, InboxThreadDto } from '../../../types'

// Helpers of the built-in channel adapters (`runtime/channels/*`).

/** The `Reply-To` of an email account: `config.replyTo`, else its own address. */
export function inboxReplyToAddress(account: InboxChannelAccountDto | null): string | undefined {
  if (!account) return undefined
  const replyTo = typeof account.config.replyTo === 'string' ? account.config.replyTo : undefined
  return replyTo || (account.channel === 'email' ? account.address : undefined)
}

/** The address a mailbox is answered at: its first enabled email account, for threads that did not come in by email. */
export async function inboxMailboxEmailAddress(mailboxId: string): Promise<string | undefined> {
  const [row] = await db.select({ address: schema.inboxChannelAccounts.address, config: schema.inboxChannelAccounts.config }).from(schema.inboxChannelAccounts)
    .where(and(eq(schema.inboxChannelAccounts.mailboxId, mailboxId), eq(schema.inboxChannelAccounts.channel, 'email'), eq(schema.inboxChannelAccounts.enabled, true)))
    .orderBy(asc(schema.inboxChannelAccounts.createdAt)).limit(1)
  if (!row) return undefined
  return (typeof row.config?.replyTo === 'string' && row.config.replyTo) || row.address
}

/** The subject of a reply: `Re: <subject> [ibt_...]`, so an answer threads back by its subject. */
export function inboxReplySubject(thread: Pick<InboxThreadDto, 'id' | 'subject'>): string {
  return `Re: ${thread.subject || 'Your message'} [${thread.id}]`
}

/** Sends a reply by email to the contact (`409 no_reply_address` when they left no address). */
export async function inboxSendEmailReply(input: { thread: InboxThreadDto, contact: InboxContactDetails, body: string, replyTo?: string }): Promise<void> {
  const to = input.contact.email ?? (input.contact.channel === 'email' ? input.contact.externalId : null)
  if (!to) throw apiError(409, 'no_reply_address', 'The contact left no email address to reply to.')
  await dispatchEmailNotification({
    to,
    subject: inboxReplySubject(input.thread),
    body: inboxTextToHtml(input.body),
    text: input.body,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    meta: { inboxThreadId: input.thread.id },
  })
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
