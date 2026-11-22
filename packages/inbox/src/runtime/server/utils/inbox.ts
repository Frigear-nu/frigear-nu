import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { asc, eq, inArray } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { readGrants } from '@frigear-nu/auth/grants'
import { apiError, likeContains, notFound, validationError } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../access'
import type { InboxThreadAbilities, InboxUserRef } from '../../../types'
import type { InboxChannelAccountRow, InboxContactRow, InboxMailboxRow, InboxThreadRow } from './inbox-dto'

/** D1 binds at most 100 parameters per statement: id lists are cut into chunks of this size. */
export const INBOX_CHUNK = 90

/** `list` in chunks of `size`. */
export function inboxChunks<T>(list: readonly T[], size = INBOX_CHUNK): T[][] {
  const out: T[][] = []
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size))
  return out
}

// --- Lookups ---------------------------------------------------------------------------------------------------------

export async function findInboxMailbox(id: string): Promise<InboxMailboxRow | undefined> {
  const [row] = await db.select().from(schema.inboxMailboxes).where(eq(schema.inboxMailboxes.id, id)).limit(1)
  return row
}

export async function findInboxMailboxByKey(key: string): Promise<InboxMailboxRow | undefined> {
  const [row] = await db.select().from(schema.inboxMailboxes).where(eq(schema.inboxMailboxes.key, key)).limit(1)
  return row
}

export async function findInboxThread(id: string): Promise<InboxThreadRow | undefined> {
  const [row] = await db.select().from(schema.inboxThreads).where(eq(schema.inboxThreads.id, id)).limit(1)
  return row
}

export async function findInboxContact(id: string): Promise<InboxContactRow | undefined> {
  const [row] = await db.select().from(schema.inboxContacts).where(eq(schema.inboxContacts.id, id)).limit(1)
  return row
}

export async function findInboxChannelAccount(id: string): Promise<InboxChannelAccountRow | undefined> {
  const [row] = await db.select().from(schema.inboxChannelAccounts).where(eq(schema.inboxChannelAccounts.id, id)).limit(1)
  return row
}

export async function getInboxMailboxOr404(id: string): Promise<InboxMailboxRow> {
  const row = await findInboxMailbox(id)
  if (!row) throw notFound('Mailbox not found.')
  return row
}

/** Every mailbox, by name order of their keys. A deployment has a handful, so they are read whole. */
export function listInboxMailboxes(): Promise<InboxMailboxRow[]> {
  return db.select().from(schema.inboxMailboxes).orderBy(asc(schema.inboxMailboxes.key))
}

/** Names of users, for assignees, authors and actors. Without a `users` table, nobody has a name. */
export async function inboxUserRefs(ids: Array<number | null | undefined>): Promise<Map<number, InboxUserRef>> {
  const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number'))]
  const refs = new Map<number, InboxUserRef>()
  const users = (schema as unknown as { users?: typeof schema.users }).users
  if (!unique.length || !users) return refs
  for (const chunk of inboxChunks(unique)) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, chunk))
    for (const row of rows) refs.set(Number(row.id), { id: Number(row.id), name: row.name ?? null })
  }
  return refs
}

// --- Who is looking ------------------------------------------------------------------------------------------------------

type InboxEventContext = { inboxRoles?: Promise<string[]> }

/** The caller's global roles (closed over `inherit`), once per request. */
export function inboxCallerRoles(event: H3Event): Promise<string[]> {
  const context = event.context as InboxEventContext
  context.inboxRoles ??= (async () => {
    const principal = await getAuth(event)
    return principal?.user ? getEffectiveRoles(event, principal.user) : []
  })()
  return context.inboxRoles
}

/**
 * Whoever a mailbox or thread rule is evaluated for: the caller (`inboxCallerSubject`) or another user, such as an
 * assignee (`inboxUserSubject`). The rules never read the session from `event` themselves.
 */
export type InboxSubject = {
  user: { id: string | number }
  /** Holds `inbox:manage` (without a record). */
  manages: () => Promise<boolean>
  /** Global roles, closed over `inherit`. */
  roles: () => Promise<string[]>
}

/** The caller as a subject, with the per-request caches. */
export function inboxCallerSubject(event: H3Event, user: { id: string | number }): InboxSubject {
  return {
    user,
    manages: () => allows(event, inboxAccess.permissions.manage),
    roles: () => inboxCallerRoles(event),
  }
}

/** Another user as a subject: their own roles, and `inbox:manage` as their session would hold it. */
export function inboxUserSubject(event: H3Event, user: Parameters<typeof subjectAllowed>[1]): InboxSubject {
  let roles: Promise<string[]> | undefined
  return {
    user,
    manages: () => subjectAllowed(event, user, inboxAccess.permissions.manage),
    roles: () => (roles ??= getEffectiveRoles(event, user)),
  }
}

/** A hidden thread is seen only by people who hold its `hiddenBelow` role (roles inherit along the host's chain). */
export async function inboxSeesHidden(subject: InboxSubject, hiddenBelow: string | null | undefined): Promise<boolean> {
  if (!hiddenBelow) return true
  return (await subject.roles()).includes(hiddenBelow)
}

/**
 * The record rule of `inbox:read` and `inbox:reply` for a mailbox: staff with `inbox:manage` read every one, a team's
 * leads read the team's, anyone else whom its grants (`@frigear-nu/auth`) admit. An empty list lets nobody else in, and
 * a `public` grant never counts: a mailbox holds outsiders' messages, so it is never open to everyone.
 */
export async function inboxCanAccessMailbox(event: H3Event, subject: InboxSubject, mailbox: InboxMailboxRow): Promise<boolean> {
  if (await subject.manages()) return true
  if (mailbox.ownerType === 'team' && mailbox.ownerId && await inboxIsTeamLead(event, subject.user.id, mailbox.ownerId)) return true
  const grants = readGrants(mailbox.grants).filter(grant => grant.kind !== 'public')
  return grants.length > 0 && grantsMatch(event, subject.user, grants)
}

/** The same rule for a thread: its `hiddenBelow` first, then its mailbox. */
export async function inboxCanAccessThread(event: H3Event, subject: InboxSubject, thread: InboxThreadRow, mailbox?: InboxMailboxRow): Promise<boolean> {
  if (!(await inboxSeesHidden(subject, thread.hiddenBelow))) return false
  const box = mailbox ?? await findInboxMailbox(thread.mailboxId)
  return !!box && inboxCanAccessMailbox(event, subject, box)
}

/** The mailboxes the caller reads (`inbox:read` with each mailbox as the record). */
export async function inboxReadableMailboxes(event: H3Event): Promise<InboxMailboxRow[]> {
  const readable: InboxMailboxRow[] = []
  for (const mailbox of await listInboxMailboxes()) {
    if (await allows(event, inboxAccess.permissions.read, mailbox)) readable.push(mailbox)
  }
  return readable
}

/**
 * Those of `threads` the caller reads: in a mailbox they read (`inboxReadableMailboxes`) and not hidden below a role
 * they lack. The same rule as `inbox:read` with each thread as the record, with the mailboxes checked once.
 */
export async function inboxVisibleThreads<T extends Pick<InboxThreadRow, 'mailboxId' | 'hiddenBelow'>>(event: H3Event, threads: T[]): Promise<T[]> {
  if (!threads.length) return []
  const readable = new Set((await inboxReadableMailboxes(event)).map(mailbox => mailbox.id))
  const roles = await inboxCallerRoles(event)
  return threads.filter(thread => readable.has(thread.mailboxId) && (!thread.hiddenBelow || roles.includes(thread.hiddenBelow)))
}

/**
 * The thread behind `:id` for a caller who passed `authorize(event, inbox:read)`: a thread they may not read (an
 * unknown id, another mailbox, hidden from their role) is the same 404.
 */
export async function getReadableInboxThreadOr404(event: H3Event, id: string): Promise<InboxThreadRow> {
  const thread = await findInboxThread(id)
  if (!thread || !(await allows(event, inboxAccess.permissions.read, thread))) throw notFound('Thread not found.')
  return thread
}

/** What the caller may do with a thread they read. */
export async function inboxAbilities(event: H3Event, thread: InboxThreadRow): Promise<InboxThreadAbilities> {
  const [reply, assign, hide, pii, audit, manage] = await Promise.all([
    allows(event, inboxAccess.permissions.reply, thread),
    allows(event, inboxAccess.permissions.assign),
    allows(event, inboxAccess.permissions.hide),
    allows(event, inboxAccess.permissions.pii),
    allows(event, inboxAccess.permissions['inbox-audit:pii']),
    allows(event, inboxAccess.permissions.manage),
  ])
  return { reply, assign, hide, pii, audit, erase: manage && pii }
}

/**
 * Whether user `userId` could read and answer `thread` themselves: they hold `inbox:reply`, its `hiddenBelow` role
 * and access to its mailbox, all evaluated for them, not for the caller. `false` for an unknown user.
 */
export async function inboxUserCanAccessThread(event: H3Event, userId: number, thread: Pick<InboxThreadRow, 'mailboxId' | 'hiddenBelow'>): Promise<boolean> {
  const user = await loadAuthUser(userId)
  if (!user) return false
  if (!(await subjectAllowed(event, user, inboxAccess.permissions.reply))) return false
  return inboxCanAccessThread(event, inboxUserSubject(event, user), thread as InboxThreadRow)
}

/** 400 `validation_error` for an unknown user, 409 `assignee_no_access` for one who could not read and answer the thread. */
export async function inboxAssertAssignee(event: H3Event, userId: number, thread: Pick<InboxThreadRow, 'mailboxId' | 'hiddenBelow'>): Promise<void> {
  if (!(await loadAuthUser(userId))) throw validationError([{ path: ['assigneeId'], message: 'This user does not exist.' }], 'Invalid assignee')
  if (!(await inboxUserCanAccessThread(event, userId, thread))) {
    throw apiError(409, 'assignee_no_access', 'This user cannot read and answer this thread: they lack access to its mailbox or the role it is hidden below.')
  }
}

/** The most candidates `inboxAssigneeCandidates` answers, and the most users it looks at to find them. */
export const INBOX_ASSIGNEE_LIMIT = 50
const INBOX_ASSIGNEE_SCAN = 1000

/**
 * The users who could be assigned `thread` (`inboxUserCanAccessThread`, the rule `inboxAssertAssignee` enforces), by
 * name, optionally those whose name contains `q`. Users are read in D1-sized pages; at most `INBOX_ASSIGNEE_LIMIT` are
 * answered and `INBOX_ASSIGNEE_SCAN` looked at, so `q` narrows a large user base. Without a `users` table, nobody.
 */
export async function inboxAssigneeCandidates(event: H3Event, thread: Pick<InboxThreadRow, 'mailboxId' | 'hiddenBelow'>, options: { q?: string } = {}): Promise<InboxUserRef[]> {
  const users = (schema as unknown as { users?: typeof schema.users }).users
  if (!users) return []
  const where: SQL | undefined = options.q ? likeContains(users.name, options.q) : undefined
  const found: InboxUserRef[] = []
  for (let offset = 0; offset < INBOX_ASSIGNEE_SCAN && found.length < INBOX_ASSIGNEE_LIMIT; offset += INBOX_CHUNK) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(where).orderBy(asc(users.name), asc(users.id)).limit(INBOX_CHUNK).offset(offset)
    const allowed = await Promise.all(rows.map(row => inboxUserCanAccessThread(event, Number(row.id), thread)))
    rows.forEach((row, index) => {
      if (allowed[index] && found.length < INBOX_ASSIGNEE_LIMIT) found.push({ id: Number(row.id), name: row.name ?? null })
    })
    if (rows.length < INBOX_CHUNK) break
  }
  return found
}
