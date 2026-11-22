import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { chunkParams } from '@frigear-nu/module-kit/server'
import type { InboxRetentionMode, InboxRetentionResult } from '../../../types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Blanks the messages of threads (D1-sized chunks) and closes them: bodies, attachments, cc recipients and provider ids
 * (`erased:<message id>`) go, the subject and preview too. The threads stay, as a record that something was answered.
 * The provider ids are tombstoned first, so a replayed webhook does not bring a message back.
 */
export async function inboxAnonymiseThreads(threadIds: string[], now = new Date()): Promise<void> {
  await inboxTombstoneThreads(threadIds, now)
  for (const chunk of chunkParams(threadIds)) {
    await db.update(schema.inboxMessages)
      .set({ body: '', attachments: [], cc: null, externalId: sql`'erased:' || ${schema.inboxMessages.id}` })
      .where(inArray(schema.inboxMessages.threadId, chunk))
    await db.update(schema.inboxThreads)
      .set({ subject: null, preview: null, status: 'closed', anonymisedAt: now })
      .where(inArray(schema.inboxThreads.id, chunk))
  }
}

/** Removes a contact's details; a new message from the same identity starts a new contact. */
async function eraseContactRows(contactIds: string[], now: Date): Promise<void> {
  for (const id of contactIds) {
    await db.update(schema.inboxContacts)
      .set({ name: null, email: null, phone: null, userId: null, externalId: `erased:${id}`, erasedAt: now })
      .where(eq(schema.inboxContacts.id, id))
  }
}

/** Deletes threads with their messages (D1-sized chunks), tombstoning their provider ids first. */
async function deleteThreads(threadIds: string[], now: Date): Promise<void> {
  await inboxTombstoneThreads(threadIds, now)
  for (const chunk of chunkParams(threadIds)) {
    await db.delete(schema.inboxMessages).where(inArray(schema.inboxMessages.threadId, chunk))
    await db.delete(schema.inboxThreads).where(inArray(schema.inboxThreads.id, chunk))
  }
}

/** Deletes those of `contactIds` that no thread points at any more. */
async function deleteOrphanContacts(contactIds: string[]): Promise<number> {
  let deleted = 0
  for (const chunk of chunkParams([...new Set(contactIds)])) {
    const used = new Set((await db.select({ contactId: schema.inboxThreads.contactId }).from(schema.inboxThreads).where(inArray(schema.inboxThreads.contactId, chunk))).map(row => row.contactId))
    const orphans = chunk.filter(id => !used.has(id))
    if (!orphans.length) continue
    await db.delete(schema.inboxContacts).where(inArray(schema.inboxContacts.id, orphans))
    deleted += orphans.length
  }
  return deleted
}

/** Erases those of `contactIds` (not erased yet) whose every thread is anonymised: nothing of theirs is left to keep. */
async function eraseFullyAnonymisedContacts(contactIds: string[], now: Date): Promise<number> {
  const erase: string[] = []
  for (const chunk of chunkParams([...new Set(contactIds)])) {
    const live = new Set((await db.select({ contactId: schema.inboxThreads.contactId }).from(schema.inboxThreads)
      .where(and(inArray(schema.inboxThreads.contactId, chunk), isNull(schema.inboxThreads.anonymisedAt)))).map(row => row.contactId))
    const candidates = chunk.filter(id => !live.has(id))
    if (!candidates.length) continue
    const open = await db.select({ id: schema.inboxContacts.id }).from(schema.inboxContacts)
      .where(and(inArray(schema.inboxContacts.id, candidates), isNull(schema.inboxContacts.erasedAt)))
    erase.push(...open.map(row => row.id))
  }
  await eraseContactRows(erase, now)
  return erase.length
}

/**
 * One retention run: the closed threads whose last message is older than their mailbox keeps them (its
 * `retentionDays`, else `inbox.retention.days`) are deleted with their messages (`mode: 'delete'`; contacts left
 * without a thread go too) or blanked (`mode: 'anonymise'`; contacts left with only anonymised threads are erased). At
 * most `batch` threads per run, so a big backlog is worked off over several runs within D1's limits; one audit entry
 * per mailbox records what went. The provider ids of what went are tombstoned, so a replayed webhook is not stored
 * again, and tombstones older than `retention.tombstoneDays` are pruned. `mode` overrides the configured one (manual
 * runs and tests).
 */
export async function inboxRunRetention(options: { now?: Date, event?: H3Event, mode?: InboxRetentionMode } = {}): Promise<InboxRetentionResult> {
  const config = inboxConfig(options.event).retention
  const now = options.now ?? new Date()
  const mode: InboxRetentionMode = options.mode ?? config.mode
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
    const contactIds = rows.map(row => row.contactId)
    if (mode === 'anonymise') {
      await inboxAnonymiseThreads(ids, now)
      result.contacts += await eraseFullyAnonymisedContacts(contactIds, now)
    }
    else {
      await deleteThreads(ids, now)
      result.contacts += await deleteOrphanContacts(contactIds)
    }
    budget -= rows.length
    result.threads += rows.length
    result.mailboxes++
    await inboxAudit(undefined, { action: 'retention', actorId: null, mailboxId: mailbox.id, data: { mailboxId: mailbox.id, mode, threads: rows.length, before: cutoff.toISOString() } })
  }
  // The provider ids of removed messages are remembered `tombstoneDays` (from their removal), then forgotten.
  await inboxPruneTombstones(new Date(now.getTime() - Math.max(1, config.tombstoneDays) * DAY_MS))
  return result
}

/**
 * Erases a contact (GDPR): their name, email, phone and channel id are removed, and every thread of theirs is closed
 * with its messages blanked (bodies, attachments, provider ids); the threads stay as a record that something was
 * answered. A later message from the same person starts a new contact. Form submissions and their files are kept by
 * Forms and erased there.
 */
export async function inboxEraseContact(contactId: string, now = new Date()): Promise<{ threads: number }> {
  const threads = (await db.select({ id: schema.inboxThreads.id }).from(schema.inboxThreads).where(eq(schema.inboxThreads.contactId, contactId))).map(row => row.id)
  await inboxAnonymiseThreads(threads, now)
  await eraseContactRows([contactId], now)
  return { threads: threads.length }
}
