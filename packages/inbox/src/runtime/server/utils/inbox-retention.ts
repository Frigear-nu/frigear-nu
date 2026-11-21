import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm'
import type { InboxRetentionMode, InboxRetentionResult } from '../../../types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Blanks the messages of threads (D1-sized chunks) and marks them anonymised: the threads stay, their content goes. */
export async function inboxAnonymiseThreads(threadIds: string[], now = new Date()): Promise<void> {
  for (const chunk of inboxChunks(threadIds)) {
    await db.update(schema.inboxMessages).set({ body: '', attachments: [] }).where(inArray(schema.inboxMessages.threadId, chunk))
    await db.update(schema.inboxThreads).set({ subject: null, anonymisedAt: now }).where(inArray(schema.inboxThreads.id, chunk))
  }
}

/** Deletes threads with their messages (D1-sized chunks). */
async function deleteThreads(threadIds: string[]): Promise<void> {
  for (const chunk of inboxChunks(threadIds)) {
    await db.delete(schema.inboxMessages).where(inArray(schema.inboxMessages.threadId, chunk))
    await db.delete(schema.inboxThreads).where(inArray(schema.inboxThreads.id, chunk))
  }
}

/** Deletes those of `contactIds` that no thread points at any more. */
async function deleteOrphanContacts(contactIds: string[]): Promise<number> {
  let deleted = 0
  for (const chunk of inboxChunks([...new Set(contactIds)])) {
    const used = new Set((await db.select({ contactId: schema.inboxThreads.contactId }).from(schema.inboxThreads).where(inArray(schema.inboxThreads.contactId, chunk))).map(row => row.contactId))
    const orphans = chunk.filter(id => !used.has(id))
    if (!orphans.length) continue
    await db.delete(schema.inboxContacts).where(inArray(schema.inboxContacts.id, orphans))
    deleted += orphans.length
  }
  return deleted
}

/**
 * One retention run: the closed threads whose last message is older than their mailbox keeps them (its
 * `retentionDays`, else `inbox.retention.days`) are deleted with their messages (`mode: 'delete'`, and contacts left
 * without a thread go too) or blanked (`mode: 'anonymise'`). At most `batch` threads per run, so a big backlog is
 * worked off over several runs within D1's limits; one audit entry per mailbox records what went.
 */
export async function inboxRunRetention(options: { now?: Date, event?: H3Event } = {}): Promise<InboxRetentionResult> {
  const config = inboxConfig(options.event).retention
  const now = options.now ?? new Date()
  const mode: InboxRetentionMode = config.mode
  const result: InboxRetentionResult = { mailboxes: 0, threads: 0, contacts: 0, mode }
  let budget = Math.max(1, config.batch)

  for (const mailbox of await db.select().from(schema.inboxMailboxes).orderBy(asc(schema.inboxMailboxes.key))) {
    if (budget <= 0) break
    const days = mailbox.retentionDays ?? config.days
    if (!days) continue
    const cutoff = new Date(now.getTime() - days * DAY_MS)
    const conditions = [eq(schema.inboxThreads.mailboxId, mailbox.id), eq(schema.inboxThreads.status, 'closed'), lt(schema.inboxThreads.lastMessageAt, cutoff)]
    if (mode === 'anonymise') conditions.push(isNull(schema.inboxThreads.anonymisedAt))
    const rows = await db.select({ id: schema.inboxThreads.id, contactId: schema.inboxThreads.contactId }).from(schema.inboxThreads)
      .where(and(...conditions)).orderBy(asc(schema.inboxThreads.lastMessageAt)).limit(budget)
    if (!rows.length) continue
    const ids = rows.map(row => row.id)
    if (mode === 'anonymise') await inboxAnonymiseThreads(ids, now)
    else {
      await deleteThreads(ids)
      result.contacts += await deleteOrphanContacts(rows.map(row => row.contactId))
    }
    budget -= rows.length
    result.threads += rows.length
    result.mailboxes++
    await inboxAudit(undefined, { action: 'retention', actorId: null, data: { mailboxId: mailbox.id, mode, threads: rows.length, before: cutoff.toISOString() } })
  }
  return result
}

/**
 * Erases a contact (GDPR): their name, email, phone and channel id are removed and every message of their threads is
 * blanked; the threads stay as a record that something was answered. A later message from the same person starts a
 * new contact.
 */
export async function inboxEraseContact(contactId: string, now = new Date()): Promise<{ threads: number }> {
  const threads = (await db.select({ id: schema.inboxThreads.id }).from(schema.inboxThreads).where(eq(schema.inboxThreads.contactId, contactId))).map(row => row.id)
  await inboxAnonymiseThreads(threads, now)
  await db.update(schema.inboxContacts)
    .set({ name: null, email: null, phone: null, userId: null, externalId: `erased:${contactId}`, erasedAt: now })
    .where(eq(schema.inboxContacts.id, contactId))
  return { threads: threads.length }
}
