import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, desc, eq, gt } from 'drizzle-orm'
import { newInboxId } from '../../utils'
import type { InboxAuditAction } from '../../../types'

/** How long a repeated view of the same thread by the same person is one audit entry. */
const VIEW_WINDOW_MS = 15 * 60 * 1000

/** The signed-in caller's user id, or `null`. */
export async function inboxActorId(event: H3Event | undefined): Promise<number | null> {
  if (!event) return null
  const principal = await getAuth(event)
  return principal?.user ? Number(principal.user.id) : null
}

/**
 * Writes one audit entry. A failure is logged and never fails the request: the action it records has happened.
 * `viewed` is written once per person and thread in a 15 minute window. An entry of a thread records the thread's
 * mailbox (unless given), so the log can be filtered by mailbox access after the thread is gone.
 */
export async function inboxAudit(event: H3Event | undefined, entry: { action: InboxAuditAction, threadId?: string | null, mailboxId?: string | null, contactId?: string | null, data?: Record<string, unknown> | null, actorId?: number | null }): Promise<void> {
  try {
    const actorId = entry.actorId !== undefined ? entry.actorId : await inboxActorId(event)
    if (entry.action === 'viewed' && entry.threadId && actorId !== null) {
      const since = new Date(Date.now() - VIEW_WINDOW_MS)
      const [recent] = await db.select({ id: schema.inboxAudit.id }).from(schema.inboxAudit)
        .where(and(eq(schema.inboxAudit.threadId, entry.threadId), eq(schema.inboxAudit.actorId, actorId), eq(schema.inboxAudit.action, 'viewed'), gt(schema.inboxAudit.createdAt, since)))
        .orderBy(desc(schema.inboxAudit.createdAt)).limit(1)
      if (recent) return
    }
    let mailboxId = entry.mailboxId ?? null
    if (mailboxId === null && entry.threadId) {
      const [thread] = await db.select({ mailboxId: schema.inboxThreads.mailboxId }).from(schema.inboxThreads).where(eq(schema.inboxThreads.id, entry.threadId)).limit(1)
      mailboxId = thread?.mailboxId ?? null
    }
    await db.insert(schema.inboxAudit).values({
      id: newInboxId('iba'),
      threadId: entry.threadId ?? null,
      mailboxId,
      contactId: entry.contactId ?? null,
      actorId,
      action: entry.action,
      data: entry.data ?? null,
    })
  }
  catch (error) {
    console.error(`[inbox] could not write the audit entry "${entry.action}"`, error)
  }
}
