import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { apiError } from '@frigear-nu/module-kit/server'
import { newInboxId } from '../../utils'
import type { InboxMessageDto, InboxThreadDto, InboxThreadStatus } from '../../../types'
import { toInboxChannelAccountDto, toInboxContactDetails, toInboxMailboxDto, toInboxMessageDto, toInboxThreadDto } from './inbox-dto'
import type { InboxThreadRow } from './inbox-dto'

/** Changes a thread's status and fires `inbox:thread:status-changed`; the same status is a no-op. */
export async function inboxSetStatus(event: H3Event, thread: InboxThreadRow, to: InboxThreadStatus): Promise<InboxThreadRow> {
  const from = thread.status as InboxThreadStatus
  if (from === to) return thread
  const [updated] = await db.update(schema.inboxThreads).set({ status: to }).where(eq(schema.inboxThreads.id, thread.id)).returning()
  await useNitroApp().hooks.callHook('inbox:thread:status-changed', { event, thread: toInboxThreadDto(updated!), from, to })
  await inboxAudit(event, { action: 'status', threadId: thread.id, data: { from, to } })
  return updated!
}

/**
 * Sends a reply through the thread's channel and stores it. The channel's adapter delivers it first: when it throws,
 * nothing is stored and the caller gets a 502 `delivery_failed` (409 `channel_unavailable` when the channel or the
 * account is gone, or the contact was erased). Fires `inbox:message:sent`.
 */
export async function inboxReply(event: H3Event, thread: InboxThreadRow, input: { body: string, authorId: number, status?: InboxThreadStatus }): Promise<{ thread: InboxThreadDto, message: InboxMessageDto }> {
  const adapter = inboxChannelAdapter(thread.channel)
  if (!adapter) throw apiError(409, 'channel_unavailable', `The channel "${thread.channel}" is no longer installed.`)
  const contact = await findInboxContact(thread.contactId)
  if (!contact || contact.erasedAt) throw apiError(409, 'channel_unavailable', 'The contact was erased: there is nobody to reply to.')
  const mailbox = await findInboxMailbox(thread.mailboxId)
  const account = thread.channelAccountId ? await findInboxChannelAccount(thread.channelAccountId) : undefined
  if (account && !account.enabled) throw apiError(409, 'channel_unavailable', 'The channel account of this thread is turned off.')
  const secret = inboxSecret(account?.secretRef, event)

  const id = newInboxId('ibm')
  let externalId: string | null
  try {
    const result = await adapter.send({
      event,
      mailbox: toInboxMailboxDto(mailbox!),
      account: account ? toInboxChannelAccountDto(account, !!secret) : null,
      secret,
      thread: toInboxThreadDto(thread),
      contact: toInboxContactDetails(contact),
      message: { id, body: input.body, attachments: [] },
    })
    externalId = result?.externalId ? `${thread.channel}:out:${result.externalId}` : null
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    // A 4xx the adapter threw on purpose (no address to reply to, a missing token) keeps its meaning.
    if (status && status >= 400 && status < 500) throw error
    console.error(`[inbox] the ${thread.channel} channel could not deliver a reply in ${thread.id}`, error)
    throw apiError(502, 'delivery_failed', 'The reply could not be delivered. Nothing was sent.')
  }

  const now = new Date()
  const [message] = await db.insert(schema.inboxMessages).values({
    id,
    threadId: thread.id,
    direction: 'out',
    authorId: input.authorId,
    body: input.body,
    attachments: [],
    externalId,
    createdAt: now,
    createdAtMs: now.getTime(),
  }).returning()
  let updated = (await db.update(schema.inboxThreads).set({ lastMessageAt: now }).where(eq(schema.inboxThreads.id, thread.id)).returning())[0]!
  if (input.status) updated = await inboxSetStatus(event, updated, input.status)

  const threadDto = toInboxThreadDto(updated)
  const author = (await inboxUserRefs([input.authorId])).get(input.authorId) ?? null
  const messageDto = toInboxMessageDto(message!, author)
  await useNitroApp().hooks.callHook('inbox:message:sent', { event, thread: threadDto, message: messageDto })
  await inboxAudit(event, { action: 'replied', threadId: thread.id, actorId: input.authorId, data: { messageId: id } })
  return { thread: threadDto, message: messageDto }
}

/** Stores an internal note: never sent, never in an export, no hook. */
export async function inboxAddNote(event: H3Event, thread: InboxThreadRow, input: { body: string, authorId: number }): Promise<InboxMessageDto> {
  const [message] = await db.insert(schema.inboxMessages).values({
    id: newInboxId('ibm'),
    threadId: thread.id,
    direction: 'note',
    authorId: input.authorId,
    body: input.body,
    attachments: [],
  }).returning()
  await inboxAudit(event, { action: 'noted', threadId: thread.id, actorId: input.authorId, data: { messageId: message!.id } })
  const author = (await inboxUserRefs([input.authorId])).get(input.authorId) ?? null
  return toInboxMessageDto(message!, author)
}

/** Escapes text for an HTML email body, keeping line breaks. */
export function inboxTextToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return escaped.split(/\n{2,}/).map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('\n')
}
