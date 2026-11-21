import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, desc, eq, gt, inArray, ne } from 'drizzle-orm'
import { apiError, notFound } from '@frigear-nu/module-kit/server'
import type { ShiftSwapDto, ShiftSwapOfferDto, ShiftSwapStatus, ShiftWarning, Translated } from '../../../types'
import { newCheckInCode, newId } from '../../utils'
import { LIVE_SWAP_STATUSES, isLiveSwap } from '../../utils/status'
import { toShiftAssignmentDto, toShiftDto, toShiftPersonDto, toShiftSwapOfferDto } from './shifts-dto'
import type { ShiftAssignmentRow, ShiftSwapOfferRow, ShiftSwapRow } from './shifts-dto'
import {
  findShiftAssignmentEntry,
  getShiftAssignmentEntryOr404,
  shiftsActiveAssignmentOf,
  shiftsEligibility,
  shiftsFire,
  shiftsGuardWarningsFor,
  shiftsIsFuture,
  shiftsRoleById,
  shiftsTeamsById,
  shiftsUsersById,
} from './shifts-core'
import type { ShiftAssignmentEntry } from './shifts-core'
import { shiftsSendSwapEmail } from './shifts-emails'

/** The offer statuses still in play. */
const LIVE_OFFER_STATUSES = ['offered', 'accepted']

/** The guard codes that refuse a volunteer swap. */
const SWAP_GUARD_CODES: readonly ShiftWarning['code'][] = ['overlap', 'min_rest', 'max_shifts_per_day']

export async function findShiftSwap(id: string): Promise<ShiftSwapRow | undefined> {
  const [row] = await db.select().from(schema.shiftSwaps).where(eq(schema.shiftSwaps.id, id)).limit(1)
  return row
}

export async function getShiftSwapOr404(id: string): Promise<ShiftSwapRow> {
  const row = await findShiftSwap(id)
  if (!row) throw notFound('Swap not found.')
  return row
}

export async function getShiftSwapOfferOr404(swapId: string, offerId: string): Promise<ShiftSwapOfferRow> {
  const [row] = await db.select().from(schema.shiftSwapOffers).where(eq(schema.shiftSwapOffers.id, offerId)).limit(1)
  if (!row || row.swapId !== swapId) throw notFound('Offer not found.')
  return row
}

/** The live swap of an assignment, if any. */
export async function findLiveShiftSwapOf(assignmentId: string): Promise<ShiftSwapRow | undefined> {
  const [row] = await db.select().from(schema.shiftSwaps)
    .where(and(eq(schema.shiftSwaps.assignmentId, assignmentId), inArray(schema.shiftSwaps.status, [...LIVE_SWAP_STATUSES])))
    .orderBy(asc(schema.shiftSwaps.createdAt), asc(schema.shiftSwaps.id)).limit(1)
  return row
}

/** Moves a swap from the status the caller read to `to` (a conditional update); `undefined` when it changed first. */
async function shiftsMoveSwap(swap: Pick<ShiftSwapRow, 'id'>, from: ShiftSwapStatus | ShiftSwapStatus[], to: ShiftSwapStatus, extra: Partial<typeof schema.shiftSwaps.$inferInsert> = {}): Promise<ShiftSwapRow | undefined> {
  const froms = Array.isArray(from) ? from : [from]
  const [row] = await db.update(schema.shiftSwaps).set({ status: to, ...extra })
    .where(and(eq(schema.shiftSwaps.id, swap.id), inArray(schema.shiftSwaps.status, froms))).returning()
  return row
}

/** Moves an offer from `from` to `to` (a conditional update); `undefined` when it changed first. */
async function shiftsMoveOffer(offer: Pick<ShiftSwapOfferRow, 'id'>, from: string | string[], to: string, extra: Partial<typeof schema.shiftSwapOffers.$inferInsert> = {}): Promise<ShiftSwapOfferRow | undefined> {
  const froms = Array.isArray(from) ? from : [from]
  const [row] = await db.update(schema.shiftSwapOffers).set({ status: to, decidedAt: new Date(), ...extra })
    .where(and(eq(schema.shiftSwapOffers.id, offer.id), inArray(schema.shiftSwapOffers.status, froms))).returning()
  return row
}

/** Puts an `offered` swap back to `open` when it has no waiting offers left. */
async function shiftsSyncSwapStatus(swapId: string): Promise<void> {
  const [waiting] = await db.select({ id: schema.shiftSwapOffers.id }).from(schema.shiftSwapOffers)
    .where(and(eq(schema.shiftSwapOffers.swapId, swapId), eq(schema.shiftSwapOffers.status, 'offered'))).limit(1)
  if (!waiting) await shiftsMoveSwap({ id: swapId }, 'offered', 'open')
}

// --- DTOs ------------------------------------------------------------------------------------

/**
 * Swaps as people see them: the shift, its team and schedule, the owner (name only), and with `offers` the offers with
 * the offerers' names and the shifts they give back. `viewerId` fills `myOffer`.
 */
export async function shiftsSwapDtos(rows: ShiftSwapRow[], options: { offers?: boolean, viewerId?: number } = {}): Promise<ShiftSwapDto[]> {
  if (!rows.length) return []
  const entries = new Map<string, ShiftAssignmentEntry>()
  for (const row of rows) {
    const entry = await findShiftAssignmentEntry(row.assignmentId)
    if (entry) entries.set(row.assignmentId, entry)
  }
  const offers = await db.select().from(schema.shiftSwapOffers)
    .where(inArray(schema.shiftSwapOffers.swapId, rows.map(row => row.id)))
    .orderBy(asc(schema.shiftSwapOffers.createdAt), asc(schema.shiftSwapOffers.id))
  const offered = new Map<string, ShiftAssignmentEntry>()
  for (const offer of offers) {
    if (offer.offeredAssignmentId && !offered.has(offer.offeredAssignmentId)) {
      const entry = await findShiftAssignmentEntry(offer.offeredAssignmentId)
      if (entry) offered.set(offer.offeredAssignmentId, entry)
    }
  }
  const allEntries = [...entries.values(), ...offered.values()]
  const [users, teams] = await Promise.all([
    shiftsUsersById([...rows.map(row => row.userId), ...allEntries.map(entry => entry.assignment.userId), ...offers.map(offer => offer.userId)]),
    shiftsTeamsById(allEntries.map(entry => entry.shift.teamId)),
  ])
  const teamName = (id: string) => (teams.get(id)?.name ?? id) as Translated
  const offerDto = (offer: ShiftSwapOfferRow): ShiftSwapOfferDto => {
    const back = offer.offeredAssignmentId ? offered.get(offer.offeredAssignmentId) : undefined
    return toShiftSwapOfferDto(offer, {
      person: toShiftPersonDto(offer.userId, users.get(offer.userId), false),
      offeredShift: back ? { ...toShiftDto(back.shift, back.schedule), teamName: teamName(back.shift.teamId) } : null,
    })
  }
  return rows.flatMap((row) => {
    const entry = entries.get(row.assignmentId)
    if (!entry) return []
    const own = offers.filter(offer => offer.swapId === row.id)
    const mine = options.viewerId === undefined ? undefined : own.find(offer => offer.userId === options.viewerId && LIVE_OFFER_STATUSES.includes(offer.status))
    return [{
      id: row.id,
      assignmentId: row.assignmentId,
      status: row.status as ShiftSwapStatus,
      openedAt: row.openedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      shift: { ...toShiftDto(entry.shift, entry.schedule), teamName: teamName(entry.shift.teamId), scheduleName: entry.schedule.name as Translated },
      owner: toShiftPersonDto(row.userId, users.get(row.userId), false),
      swapMode: entry.schedule.swapMode as ShiftSwapDto['swapMode'],
      ...(options.offers ? { offers: own.map(offerDto) } : {}),
      ...(options.viewerId === undefined ? {} : { myOffer: mine ? offerDto(mine) : null }),
    }]
  })
}

async function shiftsSwapDtoOf(row: ShiftSwapRow, options: { offers?: boolean, viewerId?: number } = { offers: true }): Promise<ShiftSwapDto> {
  const [dto] = await shiftsSwapDtos([row], options)
  if (!dto) throw notFound('Swap not found.')
  return dto
}

async function shiftsOfferDtoOf(swap: ShiftSwapDto, offer: ShiftSwapOfferRow): Promise<ShiftSwapOfferDto> {
  return swap.offers?.find(item => item.id === offer.id) ?? toShiftSwapOfferDto(offer)
}

// --- Checks ----------------------------------------------------------------------------------

/** 409 unless an assignment can be given away or offered: `assigned`, in a published schedule, not started. */
function shiftsAssertSwappable(entry: ShiftAssignmentEntry, field: string): void {
  if (entry.assignment.status !== 'assigned') throw apiError(409, 'not_swappable', `Only an assigned shift can be swapped (${field}).`, { field })
  if (entry.schedule.status !== 'published') throw apiError(409, 'not_swappable', `The schedule is not published (${field}).`, { field })
  if (!shiftsIsFuture(entry.shift)) throw apiError(409, 'not_swappable', `The shift has started already (${field}).`, { field })
}

/**
 * Checks that a person can take a shift in a swap: eligible for it (an explicit role on its team, the shift role's
 * minimum), not on it already, and breaking no guard (409 `swap_guard` with the warnings). `giving` is the assignment
 * they give up in the same swap, left out of the guards.
 */
async function shiftsAssertCanTake(event: H3Event, userId: number, entry: ShiftAssignmentEntry, giving: string | null): Promise<void> {
  const role = await shiftsRoleById(entry.assignment.shiftRoleId)
  const eligibility = await shiftsEligibility(event, userId, entry.shift.teamId, role)
  if (!eligibility.eligible) throw apiError(409, 'not_eligible', 'This shift needs a role on its team that the person does not hold.', { reason: eligibility.reason, userId })
  if (await shiftsActiveAssignmentOf(entry.shift.id, userId)) throw apiError(409, 'already_assigned', 'The person is on that shift already.', { userId })
  const warnings = (await shiftsGuardWarningsFor(event, userId, entry, giving ? [giving] : [])).filter(warning => SWAP_GUARD_CODES.includes(warning.code))
  if (warnings.length) throw apiError(409, 'swap_guard', warnings[0]!.message, { warnings, userId })
}

/** Checks both directions of an exchange: the offerer takes the owner's shift, the owner takes the one given back. */
async function shiftsAssertExchange(event: H3Event, owner: ShiftAssignmentEntry, offererId: number, back: ShiftAssignmentEntry | null): Promise<void> {
  shiftsAssertSwappable(owner, 'swap')
  if (back) {
    if (back.assignment.userId !== offererId) throw apiError(409, 'not_swappable', 'The shift offered in return is not the offerer\'s.', { field: 'assignmentId' })
    shiftsAssertSwappable(back, 'assignmentId')
    if (back.shift.id === owner.shift.id) throw apiError(409, 'not_swappable', 'Offer another shift than the one on offer.', { field: 'assignmentId' })
  }
  await shiftsAssertCanTake(event, offererId, owner, back?.assignment.id ?? null)
  if (back) await shiftsAssertCanTake(event, owner.assignment.userId, back, owner.assignment.id)
}

// --- Opening and withdrawing -----------------------------------------------------------------

/**
 * Opens a swap of one of my assignments (`assigned`, published, not started). Opening it again answers the live swap.
 * Two opens at once keep the first swap.
 */
export async function shiftsOpenSwap(entry: ShiftAssignmentEntry): Promise<ShiftSwapDto> {
  shiftsAssertSwappable(entry, 'swap')
  const existing = await findLiveShiftSwapOf(entry.assignment.id)
  if (existing) return shiftsSwapDtoOf(existing)
  const [row] = await db.insert(schema.shiftSwaps).values({ id: newId('shw'), assignmentId: entry.assignment.id, userId: entry.assignment.userId, status: 'open' }).returning()
  const first = await findLiveShiftSwapOf(entry.assignment.id)
  if (first && first.id !== row!.id) {
    await db.delete(schema.shiftSwaps).where(eq(schema.shiftSwaps.id, row!.id))
    return shiftsSwapDtoOf(first)
  }
  return shiftsSwapDtoOf(row!)
}

/** Withdraws my live swap (`open`, `offered` or `pending_approval`): it is cancelled and its offers are not chosen. 404 without one. */
export async function shiftsWithdrawSwap(entry: ShiftAssignmentEntry): Promise<void> {
  const swap = await findLiveShiftSwapOf(entry.assignment.id)
  if (!swap) throw notFound('This shift is not offered for a swap.')
  const cancelled = await shiftsMoveSwap(swap, ['open', 'offered', 'pending_approval'], 'cancelled', { decidedAt: new Date() })
  if (!cancelled) throw apiError(409, 'swap_changed', 'The swap is being completed. Try again.')
  await db.update(schema.shiftSwapOffers).set({ status: 'superseded', decidedAt: new Date() })
    .where(and(eq(schema.shiftSwapOffers.swapId, swap.id), inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES)))
}

/**
 * Cancels what an assignment that leaves `assigned` (cancelled, attended, a no-show) had in play: its live swap with its
 * offers, and the offers elsewhere that gave it back (withdrawn; their swaps go back to `open` when nothing waits).
 */
export async function shiftsCancelSwapsOf(_event: H3Event, assignmentId: string): Promise<void> {
  const swaps = await db.select().from(schema.shiftSwaps)
    .where(and(eq(schema.shiftSwaps.assignmentId, assignmentId), inArray(schema.shiftSwaps.status, ['open', 'offered', 'pending_approval'])))
  for (const swap of swaps) {
    if (!await shiftsMoveSwap(swap, swap.status as ShiftSwapStatus, 'cancelled', { decidedAt: new Date() })) continue
    await db.update(schema.shiftSwapOffers).set({ status: 'superseded', decidedAt: new Date() })
      .where(and(eq(schema.shiftSwapOffers.swapId, swap.id), inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES)))
  }
  const giving = await db.select().from(schema.shiftSwapOffers)
    .where(and(eq(schema.shiftSwapOffers.offeredAssignmentId, assignmentId), inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES)))
  for (const offer of giving) {
    const moved = await shiftsMoveOffer(offer, offer.status, 'withdrawn')
    if (!moved) continue
    if (offer.status === 'accepted') await shiftsMoveSwap({ id: offer.swapId }, 'pending_approval', 'open')
    else await shiftsSyncSwapStatus(offer.swapId)
  }
}

// --- The marketplace -------------------------------------------------------------------------

/**
 * The swaps a person could take: open or with offers, in published schedules, not started, not their own, on shifts
 * they are eligible for and not on already. Each carries `myOffer`.
 */
export async function shiftsAvailableSwaps(event: H3Event, userId: number): Promise<ShiftSwapDto[]> {
  const rows = await db.select({ swap: schema.shiftSwaps, assignment: schema.shiftAssignments, shift: schema.shifts })
    .from(schema.shiftSwaps)
    .innerJoin(schema.shiftAssignments, eq(schema.shiftAssignments.id, schema.shiftSwaps.assignmentId))
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      inArray(schema.shiftSwaps.status, ['open', 'offered']),
      eq(schema.shiftSchedules.status, 'published'),
      eq(schema.shiftAssignments.status, 'assigned'),
      ne(schema.shiftAssignments.userId, userId),
      gt(schema.shifts.startsAt, new Date()),
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shiftSwaps.id))
    .limit(200)
  const takeable: ShiftSwapRow[] = []
  for (const row of rows) {
    const role = await shiftsRoleById(row.assignment.shiftRoleId)
    if (!(await shiftsEligibility(event, userId, row.shift.teamId, role)).eligible) continue
    if (await shiftsActiveAssignmentOf(row.shift.id, userId)) continue
    takeable.push(row.swap)
  }
  return shiftsSwapDtos(takeable, { viewerId: userId })
}

/** Swaps for staff (`operationId`, `status` narrow it), newest first, with their offers. */
export async function shiftsAdminSwaps(query: { operationId?: string, status?: ShiftSwapStatus }): Promise<ShiftSwapDto[]> {
  const rows = await db.select({ swap: schema.shiftSwaps }).from(schema.shiftSwaps)
    .innerJoin(schema.shiftAssignments, eq(schema.shiftAssignments.id, schema.shiftSwaps.assignmentId))
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      query.operationId ? eq(schema.shiftSchedules.operationId, query.operationId) : undefined,
      query.status ? eq(schema.shiftSwaps.status, query.status) : undefined,
    ))
    .orderBy(desc(schema.shiftSwaps.openedAt), asc(schema.shiftSwaps.id))
    .limit(500)
  return shiftsSwapDtos(rows.map(row => row.swap), { offers: true })
}

// --- Offers ----------------------------------------------------------------------------------

/**
 * Offers to take a swap, optionally giving one of my own future assignments back. Both people must be eligible for the
 * shift they get and break no guard (409 `swap_guard`); one live offer per person and swap (409 `offer_exists`). Fires
 * `shifts:swap:offered` and emails the owner.
 */
export async function shiftsOffer(event: H3Event, swap: ShiftSwapRow, userId: number, offeredAssignmentId: string | null): Promise<ShiftSwapOfferDto> {
  if (swap.status !== 'open' && swap.status !== 'offered') throw apiError(409, 'swap_closed', 'This swap takes no offers now.')
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  if (swap.userId === userId || owner.assignment.userId === userId) throw apiError(409, 'own_swap', 'You cannot offer on your own swap.')
  const back = offeredAssignmentId ? await findShiftAssignmentEntry(offeredAssignmentId) : null
  if (offeredAssignmentId && (!back || back.assignment.userId !== userId)) throw notFound('Assignment not found.')
  const [existing] = await db.select({ id: schema.shiftSwapOffers.id }).from(schema.shiftSwapOffers).where(and(
    eq(schema.shiftSwapOffers.swapId, swap.id),
    eq(schema.shiftSwapOffers.userId, userId),
    inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES),
  )).limit(1)
  if (existing) throw apiError(409, 'offer_exists', 'You have offered on this swap already. Withdraw that offer first.')
  await shiftsAssertExchange(event, owner, userId, back ?? null)

  const [offer] = await db.insert(schema.shiftSwapOffers).values({ id: newId('sho'), swapId: swap.id, userId, offeredAssignmentId: back?.assignment.id ?? null, status: 'offered' }).returning()
  const moved = await shiftsMoveSwap(swap, ['open', 'offered'], 'offered')
  if (!moved) {
    // The swap closed meanwhile: the offer never counted.
    await db.delete(schema.shiftSwapOffers).where(eq(schema.shiftSwapOffers.id, offer!.id))
    throw apiError(409, 'swap_closed', 'This swap takes no offers now.')
  }
  const dto = await shiftsSwapDtoOf(moved)
  const offerDto = await shiftsOfferDtoOf(dto, offer!)
  await shiftsFire('shifts:swap:offered', { event, swap: dto, offer: offerDto })
  await shiftsSendSwapEmail(event, 'offered', { swap: dto, offer: offerDto, to: owner.assignment.userId })
  return offerDto
}

/**
 * Withdraws my offer: a waiting one, or an accepted one still waiting for approval (the swap is open again). 409 once
 * the offer was decided otherwise.
 */
export async function shiftsWithdrawOffer(swap: ShiftSwapRow, offer: ShiftSwapOfferRow): Promise<ShiftSwapOfferDto> {
  if (offer.status === 'withdrawn') return toShiftSwapOfferDto(offer)
  if (offer.status === 'accepted' && swap.status === 'pending_approval') {
    const moved = await shiftsMoveOffer(offer, 'accepted', 'withdrawn')
    if (!moved) throw apiError(409, 'offer_changed', 'The offer changed meanwhile.')
    await shiftsMoveSwap(swap, 'pending_approval', 'open')
    return toShiftSwapOfferDto(moved)
  }
  if (offer.status !== 'offered') throw apiError(409, 'offer_changed', `The offer is ${offer.status} already.`)
  const moved = await shiftsMoveOffer(offer, 'offered', 'withdrawn')
  if (!moved) throw apiError(409, 'offer_changed', 'The offer changed meanwhile.')
  await shiftsSyncSwapStatus(swap.id)
  return toShiftSwapOfferDto(moved)
}

/** The owner turns an offer down. Fires `shifts:swap:rejected` and emails the offerer. */
export async function shiftsRejectOffer(event: H3Event, swap: ShiftSwapRow, offer: ShiftSwapOfferRow): Promise<ShiftSwapOfferDto> {
  if (offer.status === 'rejected') return toShiftSwapOfferDto(offer)
  if (offer.status !== 'offered') throw apiError(409, 'offer_changed', `The offer is ${offer.status} already.`)
  const moved = await shiftsMoveOffer(offer, 'offered', 'rejected')
  if (!moved) throw apiError(409, 'offer_changed', 'The offer changed meanwhile.')
  await shiftsSyncSwapStatus(swap.id)
  const dto = await shiftsSwapDtoOf((await findShiftSwap(swap.id))!)
  const offerDto = await shiftsOfferDtoOf(dto, moved)
  await shiftsFire('shifts:swap:rejected', { event, swap: dto, offer: offerDto })
  await shiftsSendSwapEmail(event, 'rejected', { swap: dto, offer: offerDto, to: moved.userId })
  return offerDto
}

/**
 * The owner accepts an offer. Both directions are checked again, then the swap is claimed with a conditional write, so
 * two accepts at once (of the same or of two offers) carry out one: the other gets a 409 `swap_changed`. The other
 * waiting offers are not chosen (`superseded`). In `peer` mode the swap completes at once; in `approval` mode it waits
 * for a lead of the team(s) or staff (`pending_approval`), who are emailed. Fires `shifts:swap:accepted`.
 */
export async function shiftsAcceptOffer(event: H3Event, swap: ShiftSwapRow, offer: ShiftSwapOfferRow): Promise<ShiftSwapDto> {
  if (swap.status !== 'offered') throw apiError(409, 'swap_changed', `The swap is ${swap.status}.`)
  if (offer.status !== 'offered') throw apiError(409, 'offer_changed', `The offer is ${offer.status} already.`)
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  if (owner.assignment.userId !== swap.userId) throw apiError(409, 'swap_changed', 'The shift changed hands meanwhile.')
  const back = offer.offeredAssignmentId ? await findShiftAssignmentEntry(offer.offeredAssignmentId) : null
  if (offer.offeredAssignmentId && !back) throw apiError(409, 'not_swappable', 'The shift offered in return no longer exists.')
  await shiftsAssertExchange(event, owner, offer.userId, back ?? null)

  const approval = owner.schedule.swapMode === 'approval'
  const claimed = await shiftsMoveSwap(swap, 'offered', approval ? 'pending_approval' : 'accepted')
  if (!claimed) throw apiError(409, 'swap_changed', 'The swap changed meanwhile.')
  const accepted = await shiftsMoveOffer(offer, 'offered', 'accepted')
  if (!accepted) {
    await shiftsMoveSwap(claimed, claimed.status as ShiftSwapStatus, 'offered')
    await shiftsSyncSwapStatus(swap.id)
    throw apiError(409, 'offer_changed', 'The offer was withdrawn meanwhile.')
  }
  await db.update(schema.shiftSwapOffers).set({ status: 'superseded', decidedAt: new Date() }).where(and(
    eq(schema.shiftSwapOffers.swapId, swap.id),
    eq(schema.shiftSwapOffers.status, 'offered'),
    ne(schema.shiftSwapOffers.id, offer.id),
  ))
  const dto = await shiftsSwapDtoOf(claimed)
  const offerDto = await shiftsOfferDtoOf(dto, accepted)
  await shiftsFire('shifts:swap:accepted', { event, swap: dto, offer: offerDto })
  await shiftsSendSwapEmail(event, 'accepted', { swap: dto, offer: offerDto, to: accepted.userId })
  if (approval) {
    for (const lead of await shiftsSwapApprovers(event, [owner.shift.teamId, ...(back ? [back.shift.teamId] : [])])) {
      await shiftsSendSwapEmail(event, 'pending', { swap: dto, offer: offerDto, to: lead })
    }
    return dto
  }
  return shiftsCompleteSwap(event, claimed, accepted, null)
}

/** The explicit leads of the teams (BA and up), who approve swaps in `approval` mode. */
async function shiftsSwapApprovers(event: H3Event, teamIds: string[]): Promise<number[]> {
  const ids = new Set<number>()
  for (const teamId of new Set(teamIds)) {
    for (const member of await teamMembers(event, teamId)) {
      if (teamMemberStatusGrants(member.status) && await isTeamLead(event, member.userId, teamId)) ids.add(member.userId)
    }
  }
  return [...ids]
}

/**
 * A lead of the team(s) or staff approves a swap waiting for approval: the exchange is checked again and carried out.
 * 409 `swap_changed` when it is not waiting (approved twice at once completes once).
 */
export async function shiftsApproveSwap(event: H3Event, swap: ShiftSwapRow, by: number): Promise<ShiftSwapDto> {
  if (swap.status !== 'pending_approval') throw apiError(409, 'swap_changed', `The swap is ${swap.status}.`)
  const [offer] = await db.select().from(schema.shiftSwapOffers).where(and(eq(schema.shiftSwapOffers.swapId, swap.id), eq(schema.shiftSwapOffers.status, 'accepted'))).limit(1)
  if (!offer) throw apiError(409, 'swap_changed', 'The swap has no accepted offer.')
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  if (owner.assignment.userId !== swap.userId) throw apiError(409, 'swap_changed', 'The shift changed hands meanwhile.')
  const back = offer.offeredAssignmentId ? await findShiftAssignmentEntry(offer.offeredAssignmentId) : null
  await shiftsAssertExchange(event, owner, offer.userId, back ?? null)
  const claimed = await shiftsMoveSwap(swap, 'pending_approval', 'accepted')
  if (!claimed) throw apiError(409, 'swap_changed', 'The swap changed meanwhile.')
  return shiftsCompleteSwap(event, claimed, offer, by)
}

/**
 * A lead of the team(s) or staff rejects a swap waiting for approval: the accepted offer is rejected and the swap is open
 * for offers again. Fires `shifts:swap:rejected` and emails the offerer and the owner.
 */
export async function shiftsRejectSwap(event: H3Event, swap: ShiftSwapRow, by: number): Promise<ShiftSwapDto> {
  if (swap.status !== 'pending_approval') throw apiError(409, 'swap_changed', `The swap is ${swap.status}.`)
  const reopened = await shiftsMoveSwap(swap, 'pending_approval', 'open', { decidedAt: new Date() })
  if (!reopened) throw apiError(409, 'swap_changed', 'The swap changed meanwhile.')
  const [offer] = await db.select().from(schema.shiftSwapOffers).where(and(eq(schema.shiftSwapOffers.swapId, swap.id), eq(schema.shiftSwapOffers.status, 'accepted'))).limit(1)
  const rejected = offer ? await shiftsMoveOffer(offer, 'accepted', 'rejected', { approvedBy: by }) : undefined
  const dto = await shiftsSwapDtoOf(reopened)
  if (rejected) {
    const offerDto = await shiftsOfferDtoOf(dto, rejected)
    await shiftsFire('shifts:swap:rejected', { event, swap: dto, offer: offerDto })
    await shiftsSendSwapEmail(event, 'rejected', { swap: dto, offer: offerDto, to: rejected.userId })
    await shiftsSendSwapEmail(event, 'rejected', { swap: dto, offer: offerDto, to: dto.owner.userId })
  }
  return dto
}

/**
 * Carries out a claimed (`accepted`) swap: the owner's assignment goes to the offerer and, when a shift was given back,
 * that assignment goes to the owner, each with a new check-in code. Each write is conditional on the assignment still
 * being `assigned` to the person it was read with; when one fails the other is put back, the offer is rejected and the
 * swap is open again (409 `swap_changed`). Other live swaps of the shift given back are cancelled and offers that gave
 * either assignment elsewhere are withdrawn. Fires `shifts:assignment:changed` twice (or once) and
 * `shifts:swap:completed`, and emails both people.
 */
async function shiftsCompleteSwap(event: H3Event, swap: ShiftSwapRow, offer: ShiftSwapOfferRow, approvedBy: number | null): Promise<ShiftSwapDto> {
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  const back = offer.offeredAssignmentId ? await findShiftAssignmentEntry(offer.offeredAssignmentId) : null
  const ownerId = owner.assignment.userId
  const fail = async (): Promise<never> => {
    await shiftsMoveOffer(offer, 'accepted', 'rejected')
    await shiftsMoveSwap(swap, 'accepted', 'open')
    throw apiError(409, 'swap_changed', 'One of the shifts changed meanwhile, so the swap could not be carried out.')
  }
  const handOver = async (row: ShiftAssignmentRow, to: number): Promise<ShiftAssignmentRow | undefined> => {
    const [written] = await db.update(schema.shiftAssignments).set({ userId: to, checkInCode: newCheckInCode() }).where(and(
      eq(schema.shiftAssignments.id, row.id),
      eq(schema.shiftAssignments.userId, row.userId),
      eq(schema.shiftAssignments.status, 'assigned'),
    )).returning()
    return written
  }
  const ownerNew = await handOver(owner.assignment, offer.userId)
  if (!ownerNew) return fail()
  let backNew: ShiftAssignmentRow | undefined
  if (back) {
    backNew = await handOver(back.assignment, ownerId)
    if (!backNew) {
      await db.update(schema.shiftAssignments).set({ userId: ownerId, checkInCode: newCheckInCode() }).where(eq(schema.shiftAssignments.id, owner.assignment.id))
      return fail()
    }
  }
  const completed = await shiftsMoveSwap(swap, 'accepted', 'completed', { decidedAt: new Date() })
  const finalOffer = (approvedBy !== null ? await db.update(schema.shiftSwapOffers).set({ approvedBy }).where(eq(schema.shiftSwapOffers.id, offer.id)).returning().then(rows => rows[0]) : undefined) ?? offer

  // What the two assignments had in play elsewhere.
  if (back) {
    const others = await db.select().from(schema.shiftSwaps).where(and(
      eq(schema.shiftSwaps.assignmentId, back.assignment.id),
      inArray(schema.shiftSwaps.status, ['open', 'offered', 'pending_approval']),
    ))
    for (const other of others) {
      if (await shiftsMoveSwap(other, other.status as ShiftSwapStatus, 'cancelled', { decidedAt: new Date() })) {
        await db.update(schema.shiftSwapOffers).set({ status: 'superseded', decidedAt: new Date() })
          .where(and(eq(schema.shiftSwapOffers.swapId, other.id), inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES)))
      }
    }
  }
  const ids = [owner.assignment.id, ...(back ? [back.assignment.id] : [])]
  const stale = await db.select().from(schema.shiftSwapOffers).where(and(
    inArray(schema.shiftSwapOffers.offeredAssignmentId, ids),
    inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES),
    ne(schema.shiftSwapOffers.id, offer.id),
  ))
  for (const item of stale) {
    if (!await shiftsMoveOffer(item, item.status, 'superseded')) continue
    if (item.status === 'accepted') await shiftsMoveSwap({ id: item.swapId }, 'pending_approval', 'open')
    else await shiftsSyncSwapStatus(item.swapId)
  }

  await shiftsFire('shifts:assignment:changed', { event, assignment: toShiftAssignmentDto(ownerNew), previous: toShiftAssignmentDto(owner.assignment) })
  if (back && backNew) await shiftsFire('shifts:assignment:changed', { event, assignment: toShiftAssignmentDto(backNew), previous: toShiftAssignmentDto(back.assignment) })
  const dto = await shiftsSwapDtoOf(completed ?? { ...swap, status: 'completed' })
  const offerDto = await shiftsOfferDtoOf(dto, finalOffer)
  await shiftsFire('shifts:swap:completed', { event, swap: dto, offer: offerDto })
  await shiftsSendSwapEmail(event, 'completed', { swap: dto, offer: offerDto, to: ownerId })
  await shiftsSendSwapEmail(event, 'completed', { swap: dto, offer: offerDto, to: offer.userId })
  return dto
}

/** The teams whose leads may approve a swap: the swap's shift's team and the team of the shift given back. */
export async function shiftsSwapTeamIds(swap: ShiftSwapRow): Promise<string[]> {
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  const [offer] = await db.select().from(schema.shiftSwapOffers)
    .where(and(eq(schema.shiftSwapOffers.swapId, swap.id), eq(schema.shiftSwapOffers.status, 'accepted'))).limit(1)
  const back = offer?.offeredAssignmentId ? await findShiftAssignmentEntry(offer.offeredAssignmentId) : null
  return [...new Set([owner.shift.teamId, ...(back ? [back.shift.teamId] : [])])]
}

/**
 * 403 unless the caller may approve or reject a swap: a lead of the swap's team or of the team of the shift given back
 * (`shifts:lead` with that team), or staff (the lead policy lets `shifts:manage` through).
 */
export async function shiftsAuthorizeSwapApprover(event: H3Event, swap: ShiftSwapRow): Promise<void> {
  const teamIds = await shiftsSwapTeamIds(swap)
  for (const teamId of teamIds) {
    if (await allows(event, 'shifts:lead', { teamId })) return
  }
  await authorize(event, 'shifts:lead', { teamId: teamIds[0] })
}

/** Whether a swap is still in play. */
export const shiftsSwapIsLive = (swap: Pick<ShiftSwapRow, 'status'>) => isLiveSwap(swap.status)

/** The person who opened a swap: only they accept or reject its offers. */
export const shiftsSwapOwnerId = (swap: Pick<ShiftSwapRow, 'userId'>) => swap.userId
