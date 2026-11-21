import type { H3Event } from 'h3'
import type { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { apiError, isoDate, notFound } from '@frigear-nu/module-kit/server'
import type { ShiftPassPerkDto, ShiftPerkDto, ShiftPerkGrantDto, Translated } from '../../../types'
import { newId, translate } from '../../utils'
import { shiftsChunk } from '../../utils/chunk'
import { toShiftPerkDto } from './shifts-dto'
import type { ShiftAssignmentRow, ShiftPerkGrantRow, ShiftPerkRow, ShiftRow, ShiftScheduleRow } from './shifts-dto'
import { shiftsFire, shiftsOperationTeamOr400 } from './shifts-core'
import type { ShiftAssignmentEntry } from './shifts-core'
import type { shiftsPerkInput, shiftsPerkPatch } from './shifts-schemas'

type PerkInput = z.output<typeof shiftsPerkInput>
type PerkPatch = z.output<typeof shiftsPerkPatch>

// Perks are earned: every attended assignment of a team a perk applies to gets one grant of it (`shift_perk_grants`,
// unique per perk and assignment), at the shift's end (the `shifts:close-shifts` task) or when a lead marks an ended
// shift attended. The vouchers app lists and claims them with the `perks` scope; a flip to `no_show` revokes the grants
// nobody claimed yet.

export async function getShiftPerkOr404(id: string): Promise<ShiftPerkRow> {
  const [row] = await db.select().from(schema.shiftPerks).where(eq(schema.shiftPerks.id, id)).limit(1)
  if (!row) throw notFound('Perk not found.')
  return row
}

// --- Staff ------------------------------------------------------------------------------------

/** An operation's perks, oldest first, with how many live (not revoked) grants each has. */
export async function shiftsListPerks(operationId: string): Promise<ShiftPerkDto[]> {
  const rows = await db.select().from(schema.shiftPerks).where(eq(schema.shiftPerks.operationId, operationId))
    // At most 90: the grant counts below look them up in one statement (D1 binds at most 100 parameters).
    .orderBy(asc(schema.shiftPerks.createdAt), asc(schema.shiftPerks.id)).limit(90)
  if (!rows.length) return []
  const counts = await db.select({ perkId: schema.shiftPerkGrants.perkId, total: count() }).from(schema.shiftPerkGrants)
    .where(and(inArray(schema.shiftPerkGrants.perkId, rows.map(row => row.id)), isNull(schema.shiftPerkGrants.revokedAt)))
    .groupBy(schema.shiftPerkGrants.perkId)
  const byId = new Map(counts.map(row => [row.perkId, Number(row.total)]))
  return rows.map(row => toShiftPerkDto(row, byId.get(row.id) ?? 0))
}

/** Creates a perk of an operation, for one of its teams or all of them. */
export async function shiftsCreatePerk(operationId: string, input: PerkInput): Promise<ShiftPerkRow> {
  if (input.teamId) await shiftsOperationTeamOr400(operationId, input.teamId)
  const [row] = await db.insert(schema.shiftPerks).values({
    id: newId('spk'),
    operationId,
    teamId: input.teamId ?? null,
    name: input.name,
    voucherType: input.voucherType,
    quantity: input.quantity,
  }).returning()
  return row!
}

/** Changes a perk. Grants made before keep the voucher type and quantity they were made with. */
export async function shiftsPatchPerk(existing: ShiftPerkRow, patch: PerkPatch): Promise<ShiftPerkRow> {
  const values: Partial<typeof schema.shiftPerks.$inferInsert> = {}
  if (patch.teamId !== undefined) {
    if (patch.teamId) await shiftsOperationTeamOr400(existing.operationId, patch.teamId)
    values.teamId = patch.teamId
  }
  if (patch.name !== undefined) values.name = patch.name
  if (patch.voucherType !== undefined) values.voucherType = patch.voucherType
  if (patch.quantity !== undefined) values.quantity = patch.quantity
  if (!Object.keys(values).length) return existing
  const [row] = await db.update(schema.shiftPerks).set(values).where(eq(schema.shiftPerks.id, existing.id)).returning()
  return row!
}

/** Deletes a perk nobody earned yet; 409 `perk_has_grants` once a grant (even a revoked one) exists. */
export async function shiftsDeletePerk(existing: ShiftPerkRow): Promise<void> {
  const [grant] = await db.select({ id: schema.shiftPerkGrants.id }).from(schema.shiftPerkGrants).where(eq(schema.shiftPerkGrants.perkId, existing.id)).limit(1)
  if (grant) throw apiError(409, 'perk_has_grants', 'People earned this perk already. Change it instead of deleting it.')
  await db.delete(schema.shiftPerks).where(eq(schema.shiftPerks.id, existing.id))
}

// --- Granting ---------------------------------------------------------------------------------

/** The perks that apply to a team's shifts: the operation's perks for that team or for all of them. */
async function shiftsTeamPerksRows(operationId: string, teamId: string): Promise<ShiftPerkRow[]> {
  return db.select().from(schema.shiftPerks).where(and(
    eq(schema.shiftPerks.operationId, operationId),
    or(isNull(schema.shiftPerks.teamId), eq(schema.shiftPerks.teamId, teamId)),
  )).orderBy(asc(schema.shiftPerks.createdAt), asc(schema.shiftPerks.id))
}

/**
 * Grants the perks of attended assignments of ended shifts. Idempotent: the unique `(perkId, assignmentId)` key makes a
 * second run (or a lead's mark racing the task) insert nothing; a grant revoked by an earlier `no_show` comes back to
 * the person holding the assignment now. Assignments not `attended` or of shifts that have not ended are skipped.
 * Fires `shifts:perk:granted` for every grant that was new or came back. Returns how many.
 */
export async function shiftsGrantPerks(event: H3Event | undefined, entries: Array<{ assignment: ShiftAssignmentRow, shift: ShiftRow, schedule: Pick<ShiftScheduleRow, 'operationId'> }>, now = new Date()): Promise<number> {
  const due = entries.filter(entry => entry.assignment.status === 'attended' && entry.shift.endsAt.getTime() <= now.getTime())
  if (!due.length) return 0
  const perksByTeam = new Map<string, ShiftPerkRow[]>()
  let granted = 0
  for (const { assignment, shift, schedule } of due) {
    const key = `${schedule.operationId}:${shift.teamId}`
    let perks = perksByTeam.get(key)
    if (!perks) perksByTeam.set(key, perks = await shiftsTeamPerksRows(schedule.operationId, shift.teamId))
    if (!perks.length) continue
    // A grant revoked by a flip to `no_show` comes back, to whoever holds the assignment now.
    const restored = await db.update(schema.shiftPerkGrants).set({ revokedAt: null, userId: assignment.userId }).where(and(
      eq(schema.shiftPerkGrants.assignmentId, assignment.id),
      isNotNull(schema.shiftPerkGrants.revokedAt),
    )).returning()
    // Seven parameters a row: ten rows a statement stays below D1's 100 bound parameters.
    const inserted: ShiftPerkGrantRow[] = []
    for (const part of shiftsChunk(perks, 10)) {
      inserted.push(...await db.insert(schema.shiftPerkGrants).values(part.map(perk => ({
        id: newId('spg'),
        perkId: perk.id,
        assignmentId: assignment.id,
        userId: assignment.userId,
        voucherType: perk.voucherType,
        quantity: perk.quantity,
        earnedAt: now,
      }))).onConflictDoNothing().returning())
    }
    for (const grant of [...restored, ...inserted]) {
      granted++
      await shiftsFire('shifts:perk:granted', { event, grantId: grant.id, perkId: grant.perkId, assignmentId: grant.assignmentId, userId: grant.userId })
    }
  }
  return granted
}

/** Revokes the unclaimed grants of an assignment (a flip to `no_show`); claimed ones stay. Fires `shifts:perk:revoked`. */
export async function shiftsRevokePerkGrants(event: H3Event | undefined, assignmentId: string): Promise<number> {
  const revoked = await db.update(schema.shiftPerkGrants).set({ revokedAt: new Date() }).where(and(
    eq(schema.shiftPerkGrants.assignmentId, assignmentId),
    isNull(schema.shiftPerkGrants.claimedAt),
    isNull(schema.shiftPerkGrants.revokedAt),
  )).returning()
  for (const grant of revoked) await shiftsFire('shifts:perk:revoked', { event, grantId: grant.id, perkId: grant.perkId, assignmentId: grant.assignmentId, userId: grant.userId })
  return revoked.length
}

/** The assignments (of `ids`) with a claimed grant: a no-show among them is flagged to the lead. */
export async function shiftsClaimedAssignmentIds(ids: string[]): Promise<Set<string>> {
  const rows = (await Promise.all(shiftsChunk(ids).map(part => db.select({ assignmentId: schema.shiftPerkGrants.assignmentId }).from(schema.shiftPerkGrants)
    .where(and(inArray(schema.shiftPerkGrants.assignmentId, part), isNotNull(schema.shiftPerkGrants.claimedAt)))))).flat()
  return new Set(rows.map(row => row.assignmentId))
}

/** What a shift earns, on the pass: each perk that applies, `upcoming` until granted, then its grant's state. */
export async function shiftsPassPerks(entry: ShiftAssignmentEntry): Promise<ShiftPassPerkDto[]> {
  const perks = await shiftsTeamPerksRows(entry.schedule.operationId, entry.shift.teamId)
  if (!perks.length) return []
  const grants = await db.select().from(schema.shiftPerkGrants).where(eq(schema.shiftPerkGrants.assignmentId, entry.assignment.id))
  const byPerk = new Map(grants.map(grant => [grant.perkId, grant]))
  return perks.map((perk) => {
    const grant = byPerk.get(perk.id)
    const status: ShiftPassPerkDto['status'] = !grant ? 'upcoming' : grant.revokedAt ? 'revoked' : grant.claimedAt ? 'claimed' : 'earned'
    return { perkId: perk.id, name: perk.name as Translated, voucherType: grant?.voucherType ?? perk.voucherType, quantity: grant?.quantity ?? perk.quantity, status }
  })
}

// --- The caller's grants (the vouchers app) ----------------------------------------------------

/** The language of the perk, team and operation names: the first tag of `Accept-Language`, else `en`. */
export function shiftsRequestLocale(event: H3Event): string {
  const header = getRequestHeader(event, 'accept-language') ?? ''
  const tag = header.split(',')[0]?.split(';')[0]?.trim().toLowerCase()
  return tag ? tag.split('-')[0]! : 'en'
}

const MAX_GRANTS = 1000

async function shiftsGrantDtos(rows: ShiftPerkGrantRow[], locale: string): Promise<ShiftPerkGrantDto[]> {
  if (!rows.length) return []
  const joined = (await Promise.all(shiftsChunk(rows.map(row => row.id)).map(part => db.select({
    id: schema.shiftPerkGrants.id,
    perkName: schema.shiftPerks.name,
    shiftId: schema.shifts.id,
    startsAt: schema.shifts.startsAt,
    endsAt: schema.shifts.endsAt,
    teamName: schema.teams.name,
    operationName: schema.operations.name,
  }).from(schema.shiftPerkGrants)
    .innerJoin(schema.shiftPerks, eq(schema.shiftPerks.id, schema.shiftPerkGrants.perkId))
    .innerJoin(schema.shiftAssignments, eq(schema.shiftAssignments.id, schema.shiftPerkGrants.assignmentId))
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.teams, eq(schema.teams.id, schema.shifts.teamId))
    .innerJoin(schema.operations, eq(schema.operations.id, schema.shiftPerks.operationId))
    .where(inArray(schema.shiftPerkGrants.id, part))))).flat()
  const byId = new Map(joined.map(row => [row.id, row]))
  return rows.flatMap((row) => {
    const extra = byId.get(row.id)
    if (!extra) return []
    return [{
      id: row.id,
      voucherType: row.voucherType,
      quantity: row.quantity,
      perkName: translate(extra.perkName as Translated, locale, 'en'),
      earnedAt: isoDate(row.earnedAt),
      claimedAt: isoDate(row.claimedAt),
      shift: {
        id: extra.shiftId,
        startsAt: isoDate(extra.startsAt),
        endsAt: isoDate(extra.endsAt),
        teamName: translate(extra.teamName as Translated, locale, 'en'),
        operationName: translate(extra.operationName as Translated, locale, 'en'),
      },
    }]
  })
}

/** A person's grants, oldest first: `unclaimed` (the default), `claimed` or `all`. Revoked grants are never listed. */
export async function shiftsMyPerkGrants(userId: number, status: 'unclaimed' | 'claimed' | 'all', locale: string): Promise<ShiftPerkGrantDto[]> {
  const rows = await db.select().from(schema.shiftPerkGrants).where(and(
    eq(schema.shiftPerkGrants.userId, userId),
    isNull(schema.shiftPerkGrants.revokedAt),
    status === 'unclaimed' ? isNull(schema.shiftPerkGrants.claimedAt) : status === 'claimed' ? isNotNull(schema.shiftPerkGrants.claimedAt) : undefined,
  )).orderBy(asc(schema.shiftPerkGrants.earnedAt), asc(schema.shiftPerkGrants.id)).limit(MAX_GRANTS)
  return shiftsGrantDtos(rows, locale)
}

/** One of the person's grants: someone else's is a 404, like an unknown one. */
export async function shiftsMyPerkGrantOr404(userId: number, id: string): Promise<ShiftPerkGrantRow> {
  const [row] = await db.select().from(schema.shiftPerkGrants).where(and(eq(schema.shiftPerkGrants.id, id), eq(schema.shiftPerkGrants.userId, userId))).limit(1)
  if (!row) throw notFound('Grant not found.')
  return row
}

/**
 * Claims a grant for a client (a conditional write: two claims at once set `claimedAt` once). Idempotent: a claimed grant
 * answers again with the same `claimedAt`. A revoked one is a 409 `grant_revoked`.
 */
export async function shiftsClaimPerkGrant(grant: ShiftPerkGrantRow, client: string | undefined, locale: string): Promise<ShiftPerkGrantDto> {
  if (grant.revokedAt) throw apiError(409, 'grant_revoked', 'This perk was revoked: the shift was marked a no-show.')
  let row = grant
  if (!grant.claimedAt) {
    const [claimed] = await db.update(schema.shiftPerkGrants).set({ claimedAt: new Date(), claimClient: client ?? null }).where(and(
      eq(schema.shiftPerkGrants.id, grant.id),
      isNull(schema.shiftPerkGrants.claimedAt),
      isNull(schema.shiftPerkGrants.revokedAt),
    )).returning()
    if (claimed) row = claimed
    else {
      const [current] = await db.select().from(schema.shiftPerkGrants).where(eq(schema.shiftPerkGrants.id, grant.id)).limit(1)
      if (!current) throw notFound('Grant not found.')
      if (current.revokedAt) throw apiError(409, 'grant_revoked', 'This perk was revoked: the shift was marked a no-show.')
      row = current
    }
  }
  const [dto] = await shiftsGrantDtos([row], locale)
  if (!dto) throw notFound('Grant not found.')
  return dto
}
