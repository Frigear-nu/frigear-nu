import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { parseVisibility } from '@frigear-nu/audience'
import { newInboxId } from '../../utils'
import type { InboxMailboxSeed } from '../../../types'

const RETRY_MS = 60_000
let seeding: Promise<void> | undefined
let failedAt = 0

/** Creates a mailbox of `inbox.mailboxes` unless one with its key exists; an existing one is never changed. */
export async function inboxEnsureMailbox(seed: InboxMailboxSeed): Promise<void> {
  const visibility = seed.visibility === undefined || seed.visibility === null ? null : parseVisibility(seed.visibility)
  if (seed.visibility && !visibility) throw new Error(`[inbox] the mailbox "${seed.key}" has an invalid visibility`)
  await db.insert(schema.inboxMailboxes).values({
    id: newInboxId('ibx'),
    key: seed.key,
    ownerType: seed.ownerType ?? 'platform',
    ownerId: seed.ownerType === 'team' ? seed.ownerId ?? null : null,
    name: seed.name,
    visibility,
    retentionDays: seed.retentionDays ?? null,
  }).onConflictDoNothing()
}

/**
 * Creates the configured mailboxes once per server, on the first request (NuxtHub has applied the migrations by
 * then). A failure is logged and retried on a request a minute later.
 */
export function inboxEnsureMailboxesSeeded(event: H3Event): Promise<void> {
  const seeds = inboxConfig(event).mailboxes ?? []
  if (!seeds.length) return Promise.resolve()
  if (!seeding && failedAt && Date.now() - failedAt < RETRY_MS) return Promise.resolve()
  seeding ??= (async () => {
    for (const seed of seeds) await inboxEnsureMailbox(seed)
    failedAt = 0
  })().catch((error: unknown) => {
    seeding = undefined
    failedAt = Date.now()
    console.error('[inbox] the configured mailboxes could not be created; retried on a request in a minute', error)
  })
  return seeding
}
