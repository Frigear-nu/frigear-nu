import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, ne } from 'drizzle-orm'
import type { Column, SQL, Table } from 'drizzle-orm'
import { chunkParams, conflict, notFound, searchText, validationError } from '@frigear-nu/module-kit/server'
import type { AdminOperationDto, OperationStatus } from '../../../types'
import { newId } from '../../utils'
import type { z } from 'zod'
import { operationEndsAfterStart } from './operations-schemas'
import type { operationInput, operationPatchSchema } from './operations-schemas'
import { toAdminOperationDto } from './operations-dto'
import { rethrowOperationSlugConflict } from './operations-errors'
import { operationsAccess } from '../../access'

export type OperationRow = typeof schema.operations.$inferSelect
type OperationInput = z.output<typeof operationInput>
type OperationPatch = z.output<typeof operationPatchSchema>

/** The row with this id, or `undefined`. */
export async function findOperationById(id: string): Promise<OperationRow | undefined> {
  const [row] = await db.select().from(schema.operations).where(eq(schema.operations.id, id)).limit(1)
  return row
}

/** The row with this URL name, or `undefined`. */
export async function findOperationBySlug(slug: string): Promise<OperationRow | undefined> {
  const [row] = await db.select().from(schema.operations).where(eq(schema.operations.slug, slug)).limit(1)
  return row
}

/**
 * The operation with this URL name when the caller may read it: public ones for everyone, any other only for those who
 * take part in it and for staff (the policy of `operations:read`). Everybody else gets the same 404 as for an unknown
 * name.
 */
export async function readableOperationBySlug(event: H3Event, slug: string): Promise<OperationRow> {
  const row = await findOperationBySlug(slug)
  if (!row) throw notFound('Operation not found.')
  if (row.public) return row
  const principal = await allows(event, operationsAccess.permissions.read) ? await getAuth(event) : null
  if (!principal || !(await allows(event, operationsAccess.permissions.read, row))) throw notFound('Operation not found.')
  return row
}

/** The row with this id, or a 404. */
export async function getOperationOr404(id: string): Promise<OperationRow> {
  const row = await findOperationById(id)
  if (!row) throw notFound('Operation not found.')
  return row
}

type ParticipationCache = { operationsParticipation?: Map<string, Promise<string[]>> }

/**
 * The ids of the operations `userId` takes part in, from the `operations:participation:resolve` listeners (crew).
 * Cached per request. A listener that fails counts as no participation: the user takes part in less, never more.
 */
export function operationsParticipationOf(event: H3Event | undefined, userId: string | number): Promise<string[]> {
  const run = async () => {
    const ctx = { event, user: { id: userId }, operationIds: new Set<string>() }
    try {
      await useNitroApp().hooks.callHook('operations:participation:resolve', ctx)
    }
    catch (error) {
      console.error('[operations] the participation of a user could not be resolved; they take part in nothing', error)
      return []
    }
    return [...ctx.operationIds].sort()
  }
  if (!event) return run()
  const cache = (event.context as ParticipationCache).operationsParticipation ??= new Map()
  const key = String(userId)
  if (!cache.has(key)) cache.set(key, run())
  return cache.get(key)!
}

/** Whether `userId` takes part in the operation (`operations:participation:resolve`). */
export async function operationsTakesPart(event: H3Event | undefined, userId: string | number, operationId: string): Promise<boolean> {
  return (await operationsParticipationOf(event, userId)).includes(operationId)
}

/**
 * The ids (as text) of the users who take part in any of `operationIds`, from the `operations:participants:resolve`
 * listeners (crew). A listener that fails adds nobody.
 */
export async function operationsParticipants(event: H3Event | undefined, operationIds: string[]): Promise<string[]> {
  if (!operationIds.length) return []
  const ctx = { event, operationIds: [...new Set(operationIds)], userIds: new Set<string>() }
  try {
    await useNitroApp().hooks.callHook('operations:participants:resolve', ctx)
  }
  catch (error) {
    console.error('[operations] the participants of operations could not be resolved; nobody is listed', error)
    return []
  }
  return [...ctx.userIds].map(String).sort()
}

/**
 * Whether `user` reads this operation: public ones, the ones they take part in, and every one for staff. `canManage` is
 * `allows(event, 'operations:manage')` of the caller, or `userCan` for another user.
 */
export async function operationReadable(event: H3Event | undefined, row: Pick<OperationRow, 'id' | 'public'>, user: { id: string | number } | null, canManage: boolean): Promise<boolean> {
  if (canManage || row.public) return true
  return !!user && operationsTakesPart(event, user.id, row.id)
}

/** The rows `user` reads, filtered by `status`; archived ones only when asked for. Upcoming first (ascending start). */
export async function listReadableOperations(event: H3Event, options: { user: { id: string | number } | null, canManage: boolean, status?: OperationStatus }): Promise<OperationRow[]> {
  const { user, canManage, status } = options
  const conditions: (SQL | undefined)[] = []
  if (status) conditions.push(eq(schema.operations.status, status))
  else conditions.push(ne(schema.operations.status, 'archived'))
  const rows = await db.select().from(schema.operations).where(and(...conditions)).orderBy(schema.operations.startsAt)
  if (canManage) return rows
  // Participation is filtered here rather than in SQL, so the query stays under D1's bound parameter limit however many
  // operations a user takes part in.
  const own = new Set(user ? await operationsParticipationOf(event, user.id) : [])
  return rows.filter(row => row.public || own.has(row.id))
}

/** The rows of the operations `userId` takes part in, whatever their status. */
export async function listParticipatingOperations(event: H3Event, userId: string | number): Promise<OperationRow[]> {
  const ids = await operationsParticipationOf(event, userId)
  const rows: OperationRow[] = []
  for (const chunk of chunkParams(ids)) {
    rows.push(...await db.select().from(schema.operations).where(inArray(schema.operations.id, chunk)))
  }
  return rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/** 409 when another operation already uses `slug`. */
export async function assertOperationSlugFree(slug: string, exceptId?: string): Promise<void> {
  const taken = await findOperationBySlug(slug)
  if (taken && taken.id !== exceptId) throw conflict('An operation with this slug already exists.', { field: 'slug' })
}

type EventsTable = Table & { id: Column }
type EventLookup = {
  select: (fields: Record<string, Column>) => {
    from: (table: Table) => { where: (condition: SQL) => { limit: (count: number) => Promise<unknown[]> } }
  }
}

/**
 * 400 when `eventId` names no event, but only when `@frigear-nu/events` is installed (its `events` table is in the
 * schema); without it the id is accepted as it is.
 */
export async function assertOperationEventExists(eventId: string | null | undefined): Promise<void> {
  if (!eventId) return
  const events = (schema as Record<string, unknown>).events as EventsTable | undefined
  if (!events) return
  const rows = await (db as unknown as EventLookup).select({ id: events.id }).from(events).where(eq(events.id, eventId)).limit(1)
  if (!rows.length) throw validationError([{ path: ['eventId'], message: 'This event does not exist.' }], 'Unknown event')
}

const sameValue = (a: unknown, b: unknown) =>
  a instanceof Date || b instanceof Date
    ? a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    : JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** `hostName` and the other optional texts are stored as `null` when blank. */
const blankToNull = (value: string | null | undefined) => value?.trim() ? value.trim() : null

/** Inserts an operation (always in `planning`), after the slug and event checks. */
export async function createOperationRow(input: OperationInput): Promise<OperationRow> {
  await assertOperationSlugFree(input.slug)
  await assertOperationEventExists(input.eventId)
  const [row] = await db.insert(schema.operations).values({
    id: newId('opr'),
    slug: input.slug,
    name: input.name,
    searchText: searchText(input.name, input.slug),
    description: input.description ?? null,
    hostName: blankToNull(input.hostName),
    hostUrl: input.hostUrl ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    schedule: input.schedule ?? null,
    location: input.location ?? null,
    status: 'planning',
    public: input.public ?? false,
    eventId: input.eventId ?? null,
  }).returning().catch(rethrowOperationSlugConflict)
  return row!
}

/** Applies a partial update to `existing`, after the slug, event and period checks; returns the updated row. */
export async function patchOperationRow(existing: OperationRow, patch: OperationPatch): Promise<OperationRow> {
  if (patch.slug) await assertOperationSlugFree(patch.slug, existing.id)
  if (patch.eventId !== undefined) await assertOperationEventExists(patch.eventId)
  const startsAt = patch.startsAt ?? existing.startsAt
  const endsAt = patch.endsAt === undefined ? existing.endsAt : patch.endsAt
  if (!operationEndsAfterStart({ startsAt, endsAt })) {
    throw validationError([{ path: ['endsAt'], message: 'The end cannot be before the start.' }])
  }
  const values: Partial<typeof schema.operations.$inferInsert> = {}
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.name !== undefined) values.name = patch.name
  if (patch.description !== undefined) values.description = patch.description
  if (patch.hostName !== undefined) values.hostName = blankToNull(patch.hostName)
  if (patch.hostUrl !== undefined) values.hostUrl = patch.hostUrl
  if (patch.startsAt !== undefined) values.startsAt = patch.startsAt
  if (patch.endsAt !== undefined) values.endsAt = patch.endsAt
  if (patch.schedule !== undefined) values.schedule = patch.schedule
  if (patch.location !== undefined) values.location = patch.location
  if (patch.public !== undefined) values.public = patch.public
  if (patch.eventId !== undefined) values.eventId = patch.eventId
  // Only what differs from the stored row counts: a patch that changes nothing writes nothing.
  const changed: Partial<typeof schema.operations.$inferInsert> = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !sameValue(value, existing[key as keyof OperationRow])),
  )
  if (!Object.keys(changed).length) return existing
  if (changed.name !== undefined || changed.slug !== undefined) changed.searchText = searchText(changed.name ?? existing.name, changed.slug ?? existing.slug)
  const [row] = await db.update(schema.operations).set(changed).where(eq(schema.operations.id, existing.id)).returning().catch(rethrowOperationSlugConflict)
  return row!
}

/** `{ event, operation }` and friends for the hooks: the staff DTO of a row. */
export function operationHookDto(row: OperationRow): AdminOperationDto {
  return toAdminOperationDto(row)
}
