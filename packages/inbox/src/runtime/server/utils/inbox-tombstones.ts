import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { chunkParams } from '@frigear-nu/module-kit/server'
import { sha256Hex } from '@frigear-nu/module-kit/crypto'

// Tombstones: the provider ids of inbound messages that retention or an erase removed. Webhooks carry no time a replay
// could be judged by (an email payload has none, and a signature never expires), so the inbox remembers what it removed
// instead: a replayed delivery of a removed message is ignored rather than stored again. Only a hash is kept, with the
// (opaque) id of the contact who sent it, so an erase can keep the tombstones of what retention removed of theirs.

/** Rows per tombstone insert: four bound parameters each, within D1's 100. */
const TOMBSTONE_INSERT_CHUNK = 22

/** The tombstone key of a provider id on a channel account: a hex SHA-256, so no id or address is kept in the clear. */
export function inboxTombstoneKey(channelAccountId: string, externalId: string): Promise<string> {
  return sha256Hex(`${channelAccountId}:${externalId}`)
}

/** Whether the message with this provider id on this account was removed by retention or an erase. */
export async function inboxIsTombstoned(channelAccountId: string, externalId: string): Promise<boolean> {
  const key = await inboxTombstoneKey(channelAccountId, externalId)
  const [row] = await db.select({ key: schema.inboxTombstones.key }).from(schema.inboxTombstones).where(eq(schema.inboxTombstones.key, key)).limit(1)
  return !!row
}

export type InboxTombstoneOptions = {
  /** An erase's tombstones: never pruned. */
  permanent?: boolean
}

/** Records a tombstone for every inbound message matching `where` that still has its provider id. */
async function tombstoneWhere(where: SQL, now: Date, options: InboxTombstoneOptions): Promise<void> {
  const messages = schema.inboxMessages
  const rows = await db.select({
    channelAccountId: messages.channelAccountId,
    externalId: messages.externalId,
    contactId: messages.contactId,
    threadContactId: schema.inboxThreads.contactId,
  })
    .from(messages)
    .innerJoin(schema.inboxThreads, eq(schema.inboxThreads.id, messages.threadId))
    .where(and(where, eq(messages.direction, 'in'), isNotNull(messages.channelAccountId), isNotNull(messages.externalId)))
  const values = new Map<string, { key: string, createdAt: Date, contactId: string | null, permanent: boolean }>()
  for (const row of rows) {
    if (!row.channelAccountId || !row.externalId || row.externalId.startsWith('erased:')) continue
    const key = await inboxTombstoneKey(row.channelAccountId, row.externalId)
    values.set(key, { key, createdAt: now, contactId: row.contactId ?? row.threadContactId ?? null, permanent: options.permanent === true })
  }
  for (const part of chunkParams([...values.values()], TOMBSTONE_INSERT_CHUNK)) {
    const insert = db.insert(schema.inboxTombstones).values(part)
    // An erase makes a tombstone retention wrote earlier permanent.
    if (options.permanent) await insert.onConflictDoUpdate({ target: schema.inboxTombstones.key, set: { permanent: true } })
    else await insert.onConflictDoNothing()
  }
}

/**
 * Records a tombstone for every inbound message of these threads that still has its provider id, before retention or an
 * erase deletes or blanks them (D1-sized chunks).
 */
export async function inboxTombstoneThreads(threadIds: string[], now = new Date(), options: InboxTombstoneOptions = {}): Promise<void> {
  for (const chunk of chunkParams(threadIds)) await tombstoneWhere(inArray(schema.inboxMessages.threadId, chunk), now, options)
}

/** Records a tombstone for each of these inbound messages that still has its provider id (D1-sized chunks). */
export async function inboxTombstoneMessages(messageIds: string[], now = new Date(), options: InboxTombstoneOptions = {}): Promise<void> {
  for (const chunk of chunkParams(messageIds)) await tombstoneWhere(inArray(schema.inboxMessages.id, chunk), now, options)
}

/**
 * Keeps the tombstones of the messages these contacts sent for good: an erase covers what retention removed of theirs
 * earlier too.
 */
export async function inboxKeepTombstonesOf(contactIds: string[]): Promise<void> {
  for (const chunk of chunkParams(contactIds)) {
    await db.update(schema.inboxTombstones).set({ permanent: true }).where(inArray(schema.inboxTombstones.contactId, chunk))
  }
}

/**
 * Forgets retention's tombstones written before `before`: a replay that late is stored as a new message. An erase's are
 * kept for good.
 */
export async function inboxPruneTombstones(before: Date): Promise<void> {
  await db.delete(schema.inboxTombstones).where(and(lt(schema.inboxTombstones.createdAt, before), eq(schema.inboxTombstones.permanent, false)))
}
