import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm'
import { chunkParams } from '@frigear-nu/module-kit/server'
import { sha256Hex } from '@frigear-nu/module-kit/crypto'

// Tombstones: the provider ids of inbound messages that retention or an erase removed. Webhooks carry no time a replay
// could be judged by (an email payload has none, and a signature never expires), so the inbox remembers what it removed
// instead: a replayed delivery of a removed message is ignored rather than stored again. Only a hash is kept.

/** Rows per tombstone insert: two bound parameters each, within D1's 100. */
const TOMBSTONE_INSERT_CHUNK = 45

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

/**
 * Records a tombstone for every inbound message of these threads that still has its provider id, before retention or an
 * erase deletes or blanks them (D1-sized chunks).
 */
export async function inboxTombstoneThreads(threadIds: string[], now = new Date()): Promise<void> {
  for (const chunk of chunkParams(threadIds)) {
    const rows = await db.select({ channelAccountId: schema.inboxMessages.channelAccountId, externalId: schema.inboxMessages.externalId })
      .from(schema.inboxMessages)
      .where(and(inArray(schema.inboxMessages.threadId, chunk), eq(schema.inboxMessages.direction, 'in'), isNotNull(schema.inboxMessages.channelAccountId), isNotNull(schema.inboxMessages.externalId)))
    const keys = new Set<string>()
    for (const row of rows) {
      if (!row.channelAccountId || !row.externalId || row.externalId.startsWith('erased:')) continue
      keys.add(await inboxTombstoneKey(row.channelAccountId, row.externalId))
    }
    for (const part of chunkParams([...keys], TOMBSTONE_INSERT_CHUNK)) {
      await db.insert(schema.inboxTombstones).values(part.map(key => ({ key, createdAt: now }))).onConflictDoNothing()
    }
  }
}

/** Forgets the tombstones written before `before`: a replay that late is stored as a new message. */
export async function inboxPruneTombstones(before: Date): Promise<void> {
  await db.delete(schema.inboxTombstones).where(lt(schema.inboxTombstones.createdAt, before))
}
