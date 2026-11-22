import type { InboxMailboxRow, InboxThreadRow } from './utils/inbox-dto'

type InboxRecord = InboxMailboxRow | InboxThreadRow

const isThread = (record: InboxRecord): record is InboxThreadRow => 'mailboxId' in record

/** A mailbox, or a thread (its `hiddenBelow`, then its mailbox). */
function inboxRecordAllowed(event: Parameters<typeof inboxCanAccessMailbox>[0], user: { id: string | number }, record: InboxRecord) {
  const subject = inboxCallerSubject(event, user)
  return isThread(record) ? inboxCanAccessThread(event, subject, record) : inboxCanAccessMailbox(event, subject, record)
}

// The record rules of the inbox (registered with `addPolicies` in `module.ts`). A policy only narrows: signed-in users
// hold `inbox:read` and `inbox:reply` implicitly, these decide which mailboxes and threads that covers.
export default [
  definePolicy<InboxRecord>('inbox:read', async ({ event, user, record }) => {
    if (!record) return undefined
    return inboxRecordAllowed(event, user as { id: string | number }, record)
  }),
  definePolicy<InboxRecord>('inbox:reply', async ({ event, user, record }) => {
    if (!record) return undefined
    return inboxRecordAllowed(event, user as { id: string | number }, record)
  }),
]
