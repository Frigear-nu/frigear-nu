import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm'
import { chunkParams } from '@frigear-nu/module-kit/server'
import type { InboxRetentionMode, InboxRetentionResult } from '../../../types'
import type { InboxContactRow, InboxMailboxRow, InboxThreadRow } from './inbox-dto'
import type { InboxTombstoneOptions } from './inbox-tombstones'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Blanks the messages of threads (D1-sized chunks) and closes them: bodies, attachments, cc recipients and provider ids
 * (`erased:<message id>`) go, the subject and preview too. The threads stay, as a record that something was answered.
 * The provider ids are tombstoned first, so a replayed webhook does not bring a message back (for good with
 * `permanent`, as an erase does).
 */
export async function inboxAnonymiseThreads(threadIds: string[], now = new Date(), options: InboxTombstoneOptions = {}): Promise<void> {
  await inboxTombstoneThreads(threadIds, now, options)
  for (const chunk of chunkParams(threadIds)) {
    await db.update(schema.inboxMessages)
      .set({ body: '', attachments: [], cc: null, externalId: sql`'erased:' || ${schema.inboxMessages.id}` })
      .where(inArray(schema.inboxMessages.threadId, chunk))
    await db.update(schema.inboxThreads)
      .set({ subject: null, searchText: '', preview: null, status: 'closed', anonymisedAt: now })
      .where(inArray(schema.inboxThreads.id, chunk))
  }
}

/** Removes contacts' details; a new message from the same identity starts a new contact. */
async function eraseContactRows(contactIds: string[], now: Date): Promise<void> {
  for (const id of contactIds) {
    await db.update(schema.inboxContacts)
      .set({ name: null, email: null, phone: null, userId: null, externalId: `erased:${id}`, erasedAt: now })
      .where(eq(schema.inboxContacts.id, id))
  }
}

/** The contacts who sent a message in these threads besides the threads' own contacts (an email reply to a form thread). */
async function senderContactIds(threadIds: string[]): Promise<string[]> {
  const ids = new Set<string>()
  for (const chunk of chunkParams(threadIds)) {
    const rows = await db.selectDistinct({ contactId: schema.inboxMessages.contactId }).from(schema.inboxMessages)
      .where(and(inArray(schema.inboxMessages.threadId, chunk), isNotNull(schema.inboxMessages.contactId)))
    for (const row of rows) if (row.contactId) ids.add(row.contactId)
  }
  return [...ids]
}

/** Deletes threads with their messages (D1-sized chunks), tombstoning their provider ids first. */
async function deleteThreads(threadIds: string[], now: Date): Promise<void> {
  await inboxTombstoneThreads(threadIds, now)
  for (const chunk of chunkParams(threadIds)) {
    await db.delete(schema.inboxMessages).where(inArray(schema.inboxMessages.threadId, chunk))
    await db.delete(schema.inboxThreads).where(inArray(schema.inboxThreads.id, chunk))
  }
}

/** Deletes those of `contactIds` that no thread and no message points at any more. */
async function deleteOrphanContacts(contactIds: string[]): Promise<number> {
  let deleted = 0
  for (const chunk of chunkParams([...new Set(contactIds)])) {
    const used = new Set((await db.select({ contactId: schema.inboxThreads.contactId }).from(schema.inboxThreads).where(inArray(schema.inboxThreads.contactId, chunk))).map(row => row.contactId))
    for (const row of await db.selectDistinct({ contactId: schema.inboxMessages.contactId }).from(schema.inboxMessages).where(inArray(schema.inboxMessages.contactId, chunk))) {
      if (row.contactId) used.add(row.contactId)
    }
    const orphans = chunk.filter(id => !used.has(id))
    if (!orphans.length) continue
    await db.delete(schema.inboxContacts).where(inArray(schema.inboxContacts.id, orphans))
    deleted += orphans.length
  }
  return deleted
}

/**
 * Erases those of `contactIds` (not erased yet) with nothing live left: every thread of theirs, and every thread they
 * sent a message in, is anonymised.
 */
async function eraseFullyAnonymisedContacts(contactIds: string[], now: Date): Promise<number> {
  const erase: string[] = []
  for (const chunk of chunkParams([...new Set(contactIds)])) {
    const live = new Set((await db.select({ contactId: schema.inboxThreads.contactId }).from(schema.inboxThreads)
      .where(and(inArray(schema.inboxThreads.contactId, chunk), isNull(schema.inboxThreads.anonymisedAt)))).map(row => row.contactId))
    const sent = await db.selectDistinct({ contactId: schema.inboxMessages.contactId }).from(schema.inboxMessages)
      .innerJoin(schema.inboxThreads, eq(schema.inboxThreads.id, schema.inboxMessages.threadId))
      .where(and(inArray(schema.inboxMessages.contactId, chunk), isNull(schema.inboxThreads.anonymisedAt)))
    for (const row of sent) if (row.contactId) live.add(row.contactId)
    const candidates = chunk.filter(id => !live.has(id))
    if (!candidates.length) continue
    const open = await db.select({ id: schema.inboxContacts.id }).from(schema.inboxContacts)
      .where(and(inArray(schema.inboxContacts.id, candidates), isNull(schema.inboxContacts.erasedAt)))
    erase.push(...open.map(row => row.id))
  }
  await eraseContactRows(erase, now)
  return erase.length
}

/** Applies retention to at most `limit` expired closed threads of one mailbox; answers how many it removed or blanked. */
async function retainMailbox(mailbox: InboxMailboxRow, cutoff: Date, mode: InboxRetentionMode, limit: number, now: Date, result: InboxRetentionResult): Promise<number> {
  const conditions = [eq(schema.inboxThreads.mailboxId, mailbox.id), eq(schema.inboxThreads.status, 'closed'), lt(schema.inboxThreads.lastMessageAt, cutoff)]
  if (mode === 'anonymise') conditions.push(isNull(schema.inboxThreads.anonymisedAt))
  const rows = await db.select({ id: schema.inboxThreads.id, contactId: schema.inboxThreads.contactId }).from(schema.inboxThreads)
    .where(and(...conditions)).orderBy(asc(schema.inboxThreads.lastMessageAt)).limit(limit)
  if (!rows.length) return 0
  const ids = rows.map(row => row.id)
  const contactIds = [...rows.map(row => row.contactId), ...await senderContactIds(ids)]
  if (mode === 'anonymise') {
    await inboxAnonymiseThreads(ids, now)
    result.contacts += await eraseFullyAnonymisedContacts(contactIds, now)
  }
  else {
    await deleteThreads(ids, now)
    result.contacts += await deleteOrphanContacts(contactIds)
  }
  return rows.length
}

/**
 * One retention run: the closed threads whose last message is older than their mailbox keeps them (its
 * `retentionDays`, else `inbox.retention.days`) are deleted with their messages (`mode: 'delete'`; contacts left
 * without a thread or message go too) or blanked (`mode: 'anonymise'`; contacts left with only anonymised threads are
 * erased). At most `batch` threads per run, so a big backlog is worked off over several runs within D1's limits. The
 * budget is shared fairly: each mailbox with a retention period gets an equal share first, and what the others left
 * goes to the mailboxes with more to do, so one busy mailbox never starves the rest. `more` says whether a mailbox had
 * more than it got. One audit entry per mailbox records what went. The provider ids of what went are tombstoned, so a
 * replayed webhook is not stored again, and retention's tombstones older than `retention.tombstoneDays` are pruned
 * (an erase's are kept). `mode` and `batch` override the configured ones (manual runs and tests).
 */
export async function inboxRunRetention(options: { now?: Date, event?: H3Event, mode?: InboxRetentionMode, batch?: number } = {}): Promise<InboxRetentionResult> {
  const config = inboxConfig(options.event).retention
  const now = options.now ?? new Date()
  const mode: InboxRetentionMode = options.mode ?? config.mode
  const result: InboxRetentionResult = { mailboxes: 0, threads: 0, contacts: 0, mode, more: false }
  const batch = Math.max(1, Math.floor(options.batch ?? config.batch))

  const mailboxes = (await db.select().from(schema.inboxMailboxes).orderBy(asc(schema.inboxMailboxes.key)))
    .map(mailbox => ({ mailbox, days: mailbox.retentionDays ?? config.days }))
    .filter((entry): entry is { mailbox: InboxMailboxRow, days: number } => !!entry.days)
  if (mailboxes.length) {
    const share = Math.max(1, Math.floor(batch / mailboxes.length))
    let budget = batch
    const done = new Map<string, number>()
    const full: typeof mailboxes = []
    // First an equal share each, then what is left to the mailboxes that used all of theirs.
    for (const entry of mailboxes) {
      if (budget <= 0) {
        result.more = true
        break
      }
      const limit = Math.min(share, budget)
      const count = await retainMailbox(entry.mailbox, new Date(now.getTime() - entry.days * DAY_MS), mode, limit, now, result)
      budget -= count
      if (count) done.set(entry.mailbox.id, count)
      if (count === limit) full.push(entry)
    }
    for (const entry of full) {
      if (budget <= 0) {
        result.more = true
        break
      }
      const count = await retainMailbox(entry.mailbox, new Date(now.getTime() - entry.days * DAY_MS), mode, budget, now, result)
      if (count === budget) result.more = true
      budget -= count
      if (count) done.set(entry.mailbox.id, (done.get(entry.mailbox.id) ?? 0) + count)
    }
    for (const { mailbox, days } of mailboxes) {
      const threads = done.get(mailbox.id)
      if (!threads) continue
      result.threads += threads
      result.mailboxes++
      const before = new Date(now.getTime() - days * DAY_MS)
      await inboxAudit(undefined, { action: 'retention', actorId: null, mailboxId: mailbox.id, data: { mailboxId: mailbox.id, mode, threads, before: before.toISOString() } })
    }
  }
  // The provider ids retention removed are remembered `tombstoneDays` (from their removal), then forgotten.
  await inboxPruneTombstones(new Date(now.getTime() - Math.max(1, config.tombstoneDays) * DAY_MS))
  return result
}

/**
 * What an export or an erase of a contact covers. A person can be several contacts (one per channel: the contact form,
 * email, ...), so it is the contact and every other contact (not erased) with the same email address (`contactIds`);
 * their own threads (`threads`); and the threads of other contacts they sent a message in (`foreign`, e.g. a reply by
 * email filed under a form contact of another address), with those messages (`foreignMessageIds`).
 */
export type InboxContactScope = {
  contactIds: string[]
  threads: InboxThreadRow[]
  foreign: InboxThreadRow[]
  foreignMessageIds: string[]
}

/** The contact and every other contact (not erased) that has its email address. */
export async function inboxRelatedContactIds(contact: InboxContactRow): Promise<string[]> {
  const email = contact.email?.trim().toLowerCase() || (contact.channel === 'email' && !contact.erasedAt ? contact.externalId.toLowerCase() : null)
  if (!email) return [contact.id]
  const rows = await db.select({ id: schema.inboxContacts.id }).from(schema.inboxContacts)
    .where(and(eq(sql`lower(${schema.inboxContacts.email})`, email), isNull(schema.inboxContacts.erasedAt), ne(schema.inboxContacts.id, contact.id)))
    .orderBy(asc(schema.inboxContacts.createdAt))
  return [contact.id, ...rows.map(row => row.id)]
}

/** The scope of an export or erase of `contact` (see `InboxContactScope`), in D1-sized chunks. */
export async function inboxContactScope(contact: InboxContactRow): Promise<InboxContactScope> {
  const contactIds = await inboxRelatedContactIds(contact)
  const threads: InboxThreadRow[] = []
  const sent: Array<{ id: string, threadId: string }> = []
  for (const chunk of chunkParams(contactIds)) {
    threads.push(...await db.select().from(schema.inboxThreads).where(inArray(schema.inboxThreads.contactId, chunk)))
    sent.push(...await db.select({ id: schema.inboxMessages.id, threadId: schema.inboxMessages.threadId }).from(schema.inboxMessages).where(inArray(schema.inboxMessages.contactId, chunk)))
  }
  threads.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  const own = new Set(threads.map(thread => thread.id))
  const foreignMessages = sent.filter(message => !own.has(message.threadId))
  const foreign: InboxThreadRow[] = []
  for (const chunk of chunkParams([...new Set(foreignMessages.map(message => message.threadId))])) {
    foreign.push(...await db.select().from(schema.inboxThreads).where(inArray(schema.inboxThreads.id, chunk)))
  }
  foreign.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
  return { contactIds, threads, foreign, foreignMessageIds: foreignMessages.map(message => message.id) }
}

/** Blanks these messages of other contacts' threads (permanently tombstoned) and refreshes those threads' previews. */
async function blankForeignMessages(messageIds: string[], threadIds: string[], now: Date): Promise<void> {
  await inboxTombstoneMessages(messageIds, now, { permanent: true })
  for (const chunk of chunkParams(messageIds)) {
    await db.update(schema.inboxMessages)
      .set({ body: '', attachments: [], cc: null, externalId: sql`'erased:' || ${schema.inboxMessages.id}` })
      .where(inArray(schema.inboxMessages.id, chunk))
  }
  for (const threadId of threadIds) {
    const [latest] = await db.select({ body: schema.inboxMessages.body }).from(schema.inboxMessages)
      .where(and(eq(schema.inboxMessages.threadId, threadId), ne(schema.inboxMessages.direction, 'note')))
      .orderBy(desc(schema.inboxMessages.createdAtMs)).limit(1)
    await db.update(schema.inboxThreads).set({ preview: latest ? inboxPreview(latest.body) : null }).where(eq(schema.inboxThreads.id, threadId))
  }
}

/**
 * Erases a contact (GDPR), with every other contact that has their email address (`inboxContactScope`): their names,
 * emails, phones and channel ids are removed, every thread of theirs is closed with its messages blanked (bodies,
 * attachments, provider ids), and the messages they sent in other contacts' threads are blanked too. The threads stay
 * as a record that something was answered. The tombstones of everything they sent, also what retention removed
 * earlier, are kept for good, so no replay brings it back. A later message from the same person starts a new contact.
 * Form submissions and their files are kept by Forms and erased there. Pass `scope` when the caller already has it.
 */
export async function inboxEraseContact(contactId: string, now = new Date(), scope?: InboxContactScope): Promise<{ threads: number, messages: number, contacts: number }> {
  if (!scope) {
    const contact = await findInboxContact(contactId)
    if (!contact) return { threads: 0, messages: 0, contacts: 0 }
    scope = await inboxContactScope(contact)
  }
  await inboxKeepTombstonesOf(scope.contactIds)
  await inboxAnonymiseThreads(scope.threads.map(thread => thread.id), now, { permanent: true })
  await blankForeignMessages(scope.foreignMessageIds, scope.foreign.map(thread => thread.id), now)
  await eraseContactRows(scope.contactIds, now)
  return { threads: scope.threads.length, messages: scope.foreignMessageIds.length, contacts: scope.contactIds.length }
}
