import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, ne, or } from 'drizzle-orm'
import type { Column, SQL, Table } from 'drizzle-orm'
import { resolveViewer } from '@frigear-nu/audience/server'
import { takesPart } from '@frigear-nu/audience'
import type { Viewer } from '@frigear-nu/audience'
import { conflict, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { AdminOperationDto, OperationStatus } from '../../../types'
import { newId } from '../../utils'
import type { z } from 'zod'
import { operationEndsAfterStart } from './operations-schemas'
import type { operationInput, operationPatchSchema } from './operations-schemas'
import { toAdminOperationDto } from './operations-dto'
import { isOperationUniqueViolation } from './operations-errors'

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

/** The row with this id, or a 404. */
export async function getOperationOr404(id: string): Promise<OperationRow> {
  const row = await findOperationById(id)
  if (!row) throw notFound('Operation not found.')
  return row
}

/**
 * Who is looking, through `audience:viewer:resolve`: the operations the signed-in user takes part in are filled in by
 * the modules that know it (crew). Anonymous visitors get an empty viewer.
 */
export async function resolveOperationsViewer(event: H3Event, user: { id: string | number } | null): Promise<Viewer> {
  return resolveViewer(event, {
    hooks: useNitroApp().hooks,
    user,
    globalRoles: user ? await getEffectiveRoles(event, user as Parameters<typeof getEffectiveRoles>[1]) : [],
  })
}

/**
 * Whether the viewer reads this operation: public ones, the ones they take part in, and every one for staff.
 * `canManage` is `allows(event, 'operations:manage')` of the caller.
 */
export function operationReadable(row: Pick<OperationRow, 'id' | 'public'>, viewer: Viewer, canManage: boolean): boolean {
  return canManage || row.public || takesPart(viewer, row.id)
}

/**
 * The ids of the operations a viewer takes part in: `viewer.operationIds` plus the operations they hold an explicit
 * team grant on. Mapped grants do not count, as in `takesPart`.
 */
export function participatingOperationIds(viewer: Viewer): string[] {
  const ids = new Set(viewer.operationIds)
  for (const grant of viewer.teamRoles) {
    if (grant.source === 'explicit' && grant.ownerType === 'operation' && grant.ownerId) ids.add(grant.ownerId)
  }
  return [...ids]
}

/** The rows a viewer reads, filtered by `status`; archived ones only when asked for. Upcoming first (ascending start). */
export async function listReadableOperations(options: { viewer: Viewer, canManage: boolean, status?: OperationStatus }): Promise<OperationRow[]> {
  const { viewer, canManage, status } = options
  const conditions: (SQL | undefined)[] = []
  if (status) conditions.push(eq(schema.operations.status, status))
  else conditions.push(ne(schema.operations.status, 'archived'))
  if (!canManage) {
    const ids = participatingOperationIds(viewer)
    const own = ids.length ? inArray(schema.operations.id, ids) : undefined
    conditions.push(or(eq(schema.operations.public, true), own))
  }
  return db.select().from(schema.operations).where(and(...conditions)).orderBy(schema.operations.startsAt)
}

/** The rows of the operations a viewer takes part in (`participatingOperationIds`), whatever their status. */
export async function listParticipatingOperations(viewer: Viewer): Promise<OperationRow[]> {
  const ids = participatingOperationIds(viewer)
  if (!ids.length) return []
  return db.select().from(schema.operations).where(inArray(schema.operations.id, ids)).orderBy(schema.operations.startsAt)
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

/** Two requests can pass the slug pre-check together: the unique index decides, and the loser gets the same 409. */
function rethrowSlugConflict(error: unknown): never {
  if (isOperationUniqueViolation(error)) throw conflict('An operation with this slug already exists.', { field: 'slug' })
  throw error
}

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
  }).returning().catch(rethrowSlugConflict)
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
  const [row] = await db.update(schema.operations).set(changed).where(eq(schema.operations.id, existing.id)).returning().catch(rethrowSlugConflict)
  return row!
}

/** `{ event, operation }` and friends for the hooks: the staff DTO of a row. */
export function operationHookDto(row: OperationRow): AdminOperationDto {
  return toAdminOperationDto(row)
}
