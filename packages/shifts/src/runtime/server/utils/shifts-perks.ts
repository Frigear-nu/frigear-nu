import type { H3Event } from 'h3'
import type { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, isNull, or } from 'drizzle-orm'
import { apiError, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { ShiftPassPerkDto, ShiftPerkDto, ShiftPerkRedeemDto, Translated } from '../../../types'
import { newId } from '../../utils'
import { toShiftDto, toShiftPerkDto, toShiftPerkRedemptionDto, toShiftPersonDto } from './shifts-dto'
import type { ShiftPerkRow } from './shifts-dto'
import { shiftsOperationTeamOr400, shiftsFire, shiftsUsersById } from './shifts-core'
import type { ShiftAssignmentEntry } from './shifts-core'
import { shiftsAssignmentByCode, shiftsCheckInOpen, shiftsPassWindow, shiftsStillEligible } from './shifts-assign'
import type { shiftsPerkInput, shiftsPerkPatch } from './shifts-schemas'

type PerkInput = z.output<typeof shiftsPerkInput>
type PerkPatch = z.output<typeof shiftsPerkPatch>

/** The allowance of a perk: `shift` counts redemptions of one assignment, `person` of one person across the operation. */
export const shiftsPerkLimit = (perk: Pick<ShiftPerkRow, 'perShift' | 'perPerson'>): { per: 'shift' | 'person', limit: number } =>
  perk.perShift != null ? { per: 'shift', limit: perk.perShift } : { per: 'person', limit: perk.perPerson ?? 0 }

export async function getShiftPerkOr404(id: string): Promise<ShiftPerkRow> {
  const [row] = await db.select().from(schema.shiftPerks).where(eq(schema.shiftPerks.id, id)).limit(1)
  if (!row) throw notFound('Perk not found.')
  return row
}

// --- Staff ------------------------------------------------------------------------------------

/** An operation's perks, oldest first, with how many times each was redeemed. */
export async function shiftsListPerks(operationId: string): Promise<ShiftPerkDto[]> {
  const rows = await db.select().from(schema.shiftPerks).where(eq(schema.shiftPerks.operationId, operationId))
    .orderBy(asc(schema.shiftPerks.createdAt), asc(schema.shiftPerks.id)).limit(200)
  if (!rows.length) return []
  const counts = await db.select({ perkId: schema.shiftPerkRedemptions.perkId, total: count() }).from(schema.shiftPerkRedemptions)
    .where(inArray(schema.shiftPerkRedemptions.perkId, rows.map(row => row.id))).groupBy(schema.shiftPerkRedemptions.perkId)
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
    kind: input.kind,
    name: input.name,
    perShift: input.perShift ?? null,
    perPerson: input.perPerson ?? null,
  }).returning()
  return row!
}

/** Changes a perk. Naming one of `perShift` and `perPerson` switches to it and clears the other; exactly one stays set. */
export async function shiftsPatchPerk(existing: ShiftPerkRow, patch: PerkPatch): Promise<ShiftPerkRow> {
  const values: Partial<typeof schema.shiftPerks.$inferInsert> = {}
  if (patch.teamId !== undefined) {
    if (patch.teamId) await shiftsOperationTeamOr400(existing.operationId, patch.teamId)
    values.teamId = patch.teamId
  }
  if (patch.kind !== undefined) values.kind = patch.kind
  if (patch.name !== undefined) values.name = patch.name
  if (patch.perShift != null && patch.perPerson != null) {
    throw validationError([{ path: ['perShift'], message: 'Set either an allowance per shift or a budget per person.' }])
  }
  if (patch.perShift != null) Object.assign(values, { perShift: patch.perShift, perPerson: null })
  if (patch.perPerson != null) Object.assign(values, { perPerson: patch.perPerson, perShift: null })
  if (!Object.keys(values).length) return existing
  const [row] = await db.update(schema.shiftPerks).set(values).where(eq(schema.shiftPerks.id, existing.id)).returning()
  return row!
}

/** Deletes a perk and its redemptions. */
export async function shiftsDeletePerk(existing: ShiftPerkRow): Promise<void> {
  await db.delete(schema.shiftPerkRedemptions).where(eq(schema.shiftPerkRedemptions.perkId, existing.id))
  await db.delete(schema.shiftPerks).where(eq(schema.shiftPerks.id, existing.id))
}

// --- Leads ------------------------------------------------------------------------------------

/** The perks a team's leads can redeem: the operation's perks for that team or for all teams. */
export async function shiftsTeamPerks(operationId: string, teamId: string): Promise<ShiftPerkDto[]> {
  return (await shiftsTeamPerksRows(operationId, teamId)).map(row => toShiftPerkDto(row))
}

/** How many times a perk was redeemed against what its allowance counts: this assignment (`shift`) or this person (`person`). */
async function shiftsPerkUsed(perk: ShiftPerkRow, assignmentId: string, userId: number): Promise<number> {
  const [row] = await db.select({ total: count() }).from(schema.shiftPerkRedemptions).where(and(
    eq(schema.shiftPerkRedemptions.perkId, perk.id),
    perk.perShift != null ? eq(schema.shiftPerkRedemptions.assignmentId, assignmentId) : eq(schema.shiftPerkRedemptions.userId, userId),
  ))
  return Number(row?.total ?? 0)
}

/** The perks of the operation a person may still get on this assignment, with what is left of each. */
export async function shiftsPassPerks(entry: ShiftAssignmentEntry): Promise<ShiftPassPerkDto[]> {
  const perks = await shiftsTeamPerksRows(entry.schedule.operationId, entry.shift.teamId)
  const result: ShiftPassPerkDto[] = []
  for (const perk of perks) {
    const { per, limit } = shiftsPerkLimit(perk)
    const used = await shiftsPerkUsed(perk, entry.assignment.id, entry.assignment.userId)
    result.push({ perkId: perk.id, kind: perk.kind as ShiftPassPerkDto['kind'], name: perk.name as Translated, per, limit, used, remaining: Math.max(0, limit - used) })
  }
  return result
}

async function shiftsTeamPerksRows(operationId: string, teamId: string): Promise<ShiftPerkRow[]> {
  return db.select().from(schema.shiftPerks).where(and(
    eq(schema.shiftPerks.operationId, operationId),
    or(isNull(schema.shiftPerks.teamId), eq(schema.shiftPerks.teamId, teamId)),
  )).orderBy(asc(schema.shiftPerks.createdAt), asc(schema.shiftPerks.id))
}

/**
 * Redeems a perk with the code of a person's QR pass, for a team (a lead of it, or staff). The code and the perk must
 * belong to the team (a lead learns nothing about others): an unknown code, a code of another team's shift, or a perk of
 * another team or operation is a 404. The assignment must hold a place (`assigned` or `attended`; 409
 * `not_on_shift`), the person must still hold their role on the team (409 `not_eligible`) and the pass window must be
 * open (409 `outside_window`), as for a check-in. The allowance is claimed by inserting the redemption and counting
 * again: when it went over, the row is taken back, so two scans at once never hand out more than the allowance (and may
 * both be turned away): 409 `perk_used_up`. There is no attendance side effect. Fires `shifts:perk:redeemed`.
 */
export async function shiftsRedeemPerk(event: H3Event, teamId: string, perkId: string, code: string, by: number): Promise<ShiftPerkRedeemDto> {
  const perk = await getShiftPerkOr404(perkId)
  const entry = await shiftsAssignmentByCode(code)
  if (!entry || entry.shift.teamId !== teamId) throw notFound('Unknown code.')
  const { assignment, shift, schedule } = entry
  if (perk.operationId !== schedule.operationId || (perk.teamId && perk.teamId !== teamId)) throw notFound('Perk not found.')
  if (assignment.status === 'cancelled') throw apiError(409, 'assignment_cancelled', 'This assignment was cancelled.')
  if (assignment.status !== 'assigned' && assignment.status !== 'attended') throw apiError(409, 'not_on_shift', 'This person does not hold a place on the shift.')
  if (!await shiftsStillEligible(event, assignment, shift.teamId)) throw apiError(409, 'not_eligible', 'This person no longer holds a role on the team.')
  if (!shiftsCheckInOpen(event, shift)) {
    const { opensAt, closesAt } = shiftsPassWindow(event, shift)
    throw apiError(409, 'outside_window', 'The pass for this shift is not open now.', { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() })
  }

  const { limit } = shiftsPerkLimit(perk)
  const usedUp = () => apiError(409, 'perk_used_up', 'This allowance is used up.', { limit })
  if (await shiftsPerkUsed(perk, assignment.id, assignment.userId) >= limit) throw usedUp()
  const [row] = await db.insert(schema.shiftPerkRedemptions).values({
    id: newId('spr'),
    perkId: perk.id,
    assignmentId: assignment.id,
    userId: assignment.userId,
    redeemedBy: by,
  }).returning()
  const used = await shiftsPerkUsed(perk, assignment.id, assignment.userId)
  if (used > limit) {
    await db.delete(schema.shiftPerkRedemptions).where(eq(schema.shiftPerkRedemptions.id, row!.id))
    throw usedUp()
  }
  const redemption = toShiftPerkRedemptionDto(row!)
  const dto = toShiftPerkDto(perk)
  await shiftsFire('shifts:perk:redeemed', { event, perk: dto, redemption })
  const users = await shiftsUsersById([assignment.userId])
  return {
    ok: true,
    perk: dto,
    redemption,
    remaining: Math.max(0, limit - used),
    limit,
    person: toShiftPersonDto(assignment.userId, users.get(assignment.userId), false),
    shift: toShiftDto(shift, schedule),
  }
}
