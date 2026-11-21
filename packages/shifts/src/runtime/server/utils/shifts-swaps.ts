import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, desc, eq, gt, inArray, is, ne } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { apiError, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { ShiftScheduleSettings, ShiftSwapDto, ShiftSwapGuardCode, ShiftSwapKind, ShiftSwapOfferDto, ShiftSwapStatus, ShiftWarning, Translated } from '../../../types'
import { newCheckInCode, newId } from '../../utils'
import { effectiveCapacity } from '../../utils/guards'
import { allowsSwapKind, defaultSwapKind, offerKind, scheduleSettingsOf } from '../../utils/settings'
import { LIVE_SWAP_STATUSES, isLiveSwap } from '../../utils/status'
import { toShiftAssignmentDto, toShiftDto, toShiftPersonDto, toShiftSwapOfferDto } from './shifts-dto'
import type { ShiftAssignmentRow, ShiftSwapOfferRow, ShiftSwapRow } from './shifts-dto'
import {
  findShiftAssignmentEntry,
  getShiftAssignmentEntryOr404,
  shiftsActiveAssignmentOf,
  shiftsEligibility,
  shiftsFilledCount,
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

/** How long a swap may sit in `accepted` (being carried out) before its owner or staff may recover it. */
export const SHIFTS_STUCK_SWAP_MS = 5 * 60_000

/** The guards that refuse a volunteer swap, with the 409 code each answers. */
const SWAP_GUARD_CODES: Partial<Record<ShiftWarning['code'], ShiftSwapGuardCode>> = {
  overlap: 'guard_overlap',
  min_rest: 'guard_rest',
  max_shifts_per_day: 'guard_max_per_day',
}

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
  for (const id of [...offers.map(offer => offer.offeredAssignmentId), ...rows.map(row => row.wantedAssignmentId)]) {
    if (id && !offered.has(id)) {
      const entry = await findShiftAssignmentEntry(id)
      if (entry) offered.set(id, entry)
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
    const wanted = row.wantedAssignmentId ? offered.get(row.wantedAssignmentId) : undefined
    return [{
      id: row.id,
      assignmentId: row.assignmentId,
      kind: row.kind as ShiftSwapKind,
      status: row.status as ShiftSwapStatus,
      openedAt: row.openedAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      shift: { ...toShiftDto(entry.shift, entry.schedule), teamName: teamName(entry.shift.teamId), scheduleName: entry.schedule.name as Translated },
      owner: toShiftPersonDto(row.userId, users.get(row.userId), false),
      wantedAssignmentId: row.wantedAssignmentId ?? null,
      wantedShift: wanted ? { ...toShiftDto(wanted.shift, wanted.schedule), teamName: teamName(wanted.shift.teamId) } : null,
      settings: scheduleSettingsOf(entry.schedule),
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
 * 409 `handover_not_allowed` unless the schedule allows this kind of swap now: a `trade` needs `handover` `trade` or
 * `both`; a `release` (anything that lowers the owner's count) needs `coverage: 'flexible'` and `handover` `release` or
 * `both`. Checked when a swap is opened, offered on, accepted and approved, so a schedule changed meanwhile counts.
 */
function shiftsAssertHandover(settings: Pick<ShiftScheduleSettings, 'coverage' | 'handover'>, kind: ShiftSwapKind): void {
  if (allowsSwapKind(settings, kind)) return
  const message = kind === 'trade'
    ? 'This schedule does not let volunteers trade shifts.'
    : settings.coverage === 'all'
      ? 'Volunteers must work every shift they hold in this schedule: trade the shift for one of theirs instead.'
      : 'This schedule does not let volunteers give shifts away or take them over: trade it instead.'
  throw apiError(409, 'handover_not_allowed', message, { kind, coverage: settings.coverage, handover: settings.handover })
}

/**
 * Checks that a person can take a shift in a swap, answering 409 with a code naming the guard: eligible for it (an
 * explicit role on its team, the shift role's minimum; `guard_ineligible`), not on it already (`already_assigned`), the
 * shift not over its capacity (staff forced people on, or lowered it; `guard_capacity`), and no overlap, too little rest
 * or too many shifts on one day (`guard_overlap`, `guard_rest`, `guard_max_per_day`, with the warnings). `giving` is the
 * assignment they give up in the same swap, left out of the guards. A swap moves people between assignments, so how many
 * a shift holds does not change: the minimum per shift cannot break.
 */
async function shiftsAssertCanTake(event: H3Event, userId: number, entry: ShiftAssignmentEntry, giving: string | null): Promise<void> {
  const role = await shiftsRoleById(entry.assignment.shiftRoleId)
  const eligibility = await shiftsEligibility(event, userId, entry.shift.teamId, role)
  if (!eligibility.eligible) throw apiError(409, 'guard_ineligible', 'This shift needs a role on its team that the person does not hold.', { reason: eligibility.reason, userId })
  if (await shiftsActiveAssignmentOf(entry.shift.id, userId)) throw apiError(409, 'already_assigned', 'The person is on that shift already.', { userId })
  const capacity = effectiveCapacity(entry.shift, entry.schedule)
  if (capacity !== null && await shiftsFilledCount(entry.shift.id) > capacity) {
    throw apiError(409, 'guard_capacity', `The shift holds more people than its capacity of ${capacity}: staff sort it out first.`, { capacity, userId })
  }
  const warnings = (await shiftsGuardWarningsFor(event, userId, entry, giving ? [giving] : [])).filter(warning => SWAP_GUARD_CODES[warning.code])
  if (warnings.length) throw apiError(409, SWAP_GUARD_CODES[warnings[0]!.code]!, warnings[0]!.message, { warnings, userId })
}

/**
 * The schedules of a trade, when the shift given back is in another schedule than the owner's: both must allow a trade
 * now (409 `handover_not_allowed`), and when either has `coverage: 'all'` both shifts must be in the same schedule (409
 * `handover_cross_schedule`), so nobody trades a shift they must work for one in a schedule that lets them give it away.
 */
function shiftsAssertTradeSchedules(owner: ShiftAssignmentEntry, back: ShiftAssignmentEntry): void {
  shiftsAssertHandover(scheduleSettingsOf(owner.schedule), 'trade')
  shiftsAssertHandover(scheduleSettingsOf(back.schedule), 'trade')
  if (owner.schedule.id === back.schedule.id) return
  if (owner.schedule.coverage === 'all' || back.schedule.coverage === 'all') {
    throw apiError(409, 'handover_cross_schedule', 'A schedule where every shift must be worked only trades within itself: offer a shift of the same schedule.', { field: 'assignmentId', scheduleId: owner.schedule.id })
  }
}

/** Whether a swap needs a lead's approval: either schedule involved says `approval: 'lead'`. */
const shiftsNeedsLead = (owner: ShiftAssignmentEntry, back: ShiftAssignmentEntry | null | undefined) =>
  owner.schedule.approval === 'lead' || back?.schedule.approval === 'lead'

/**
 * Checks both directions of an exchange: the offerer takes the owner's shift, the owner takes the one given back. A trade
 * across schedules needs both schedules to allow it (`shiftsAssertTradeSchedules`). The guards run for both people, each
 * as they would stand after the exchange.
 */
async function shiftsAssertExchange(event: H3Event, owner: ShiftAssignmentEntry, offererId: number, back: ShiftAssignmentEntry | null): Promise<void> {
  shiftsAssertSwappable(owner, 'swap')
  if (back) {
    if (back.assignment.userId !== offererId) throw apiError(409, 'not_swappable', 'The shift offered in return is not the offerer\'s.', { field: 'assignmentId' })
    shiftsAssertTradeSchedules(owner, back)
    shiftsAssertSwappable(back, 'assignmentId')
    if (back.shift.id === owner.shift.id) throw apiError(409, 'not_swappable', 'Offer another shift than the one on offer.', { field: 'assignmentId' })
    const [busy] = await db.select({ id: schema.shiftSwaps.id }).from(schema.shiftSwaps).where(and(
      eq(schema.shiftSwaps.assignmentId, back.assignment.id),
      inArray(schema.shiftSwaps.status, ['accepted', 'pending_approval']),
    )).limit(1)
    if (busy) throw apiError(409, 'not_swappable', 'The shift offered in return is in another swap that is being carried out.', { field: 'assignmentId' })
  }
  await shiftsAssertCanTake(event, offererId, owner, back?.assignment.id ?? null)
  if (back) await shiftsAssertCanTake(event, owner.assignment.userId, back, owner.assignment.id)
}

// --- Opening and withdrawing -----------------------------------------------------------------

/**
 * Opens a swap of one of my assignments (`assigned`, published, not started): a `trade` (shift for shift, optionally aimed
 * at one `wantedAssignmentId`) or a `release` (given away). `kind` defaults to `release` when the schedule allows it, else
 * `trade`. 409 `handover_not_allowed` when the schedule does not allow the kind. A targeted trade is checked like an offer
 * (both people eligible, no guard broken, both schedules allow it) and its holder is emailed. Opening it again answers
 * the live swap while it is of that kind and still allowed; a stale `open` one is cancelled and replaced, one with offers
 * answers 409 `swap_changed`. Two opens at once keep the first swap.
 */
export async function shiftsOpenSwap(event: H3Event, entry: ShiftAssignmentEntry, input: { kind?: ShiftSwapKind, wantedAssignmentId?: string | null } = {}): Promise<ShiftSwapDto> {
  shiftsAssertSwappable(entry, 'swap')
  const settings = scheduleSettingsOf(entry.schedule)
  const existing = await findLiveShiftSwapOf(entry.assignment.id)
  // Opening again keeps the live swap when it is still of the kind asked for (any allowed kind when none is asked for).
  const existingAllowed = !!existing && allowsSwapKind(settings, existing.kind as ShiftSwapKind)
  const kind = input.kind ?? (existing && existingAllowed ? existing.kind as ShiftSwapKind : defaultSwapKind(settings))
  shiftsAssertHandover(settings, kind)
  if (existing) {
    if (existingAllowed && existing.kind === kind) return shiftsSwapDtoOf(existing)
    // A stale swap (another kind, or one the schedule no longer allows) is replaced while nothing waits on it.
    const cancelled = existing.status === 'open' ? await shiftsMoveSwap(existing, 'open', 'cancelled', { decidedAt: new Date() }) : undefined
    if (!cancelled) throw apiError(409, 'swap_changed', 'This shift is in a swap of another kind with offers: withdraw it first.', { swapId: existing.id, kind: existing.kind })
  }
  let wanted: ShiftAssignmentEntry | null = null
  if (input.wantedAssignmentId) {
    if (kind !== 'trade') throw validationError([{ path: ['wantedAssignmentId'], message: 'Only a trade asks for a shift in return.' }])
    wanted = await findShiftAssignmentEntry(input.wantedAssignmentId) ?? null
    if (!wanted || wanted.assignment.userId === entry.assignment.userId) {
      throw validationError([{ path: ['wantedAssignmentId'], message: 'Pick a shift somebody else holds.' }], 'Unknown assignment')
    }
    await shiftsAssertExchange(event, entry, wanted.assignment.userId, wanted)
  }
  const [row] = await db.insert(schema.shiftSwaps).values({
    id: newId('shw'),
    assignmentId: entry.assignment.id,
    userId: entry.assignment.userId,
    kind,
    wantedAssignmentId: wanted?.assignment.id ?? null,
    status: 'open',
  }).returning()
  const first = await findLiveShiftSwapOf(entry.assignment.id)
  if (first && first.id !== row!.id) {
    await db.delete(schema.shiftSwaps).where(eq(schema.shiftSwaps.id, row!.id))
    return shiftsSwapDtoOf(first)
  }
  const dto = await shiftsSwapDtoOf(row!)
  if (wanted) await shiftsSendSwapEmail(event, 'proposed', { swap: dto, to: wanted.assignment.userId })
  return dto
}

/** Withdraws my live swap (`open`, `offered` or `pending_approval`): it is cancelled and its offers are not chosen. 404 without one. */
export async function shiftsWithdrawSwap(entry: ShiftAssignmentEntry): Promise<void> {
  const swap = await findLiveShiftSwapOf(entry.assignment.id)
  if (!swap) throw notFound('This shift is not offered for a swap.')
  if (swap.status === 'accepted') {
    if (Date.now() - swap.updatedAt.getTime() < SHIFTS_STUCK_SWAP_MS) throw apiError(409, 'swap_changed', 'The swap is being completed. Try again.')
    await shiftsRecoverSwap(swap)
    return
  }
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
 * The swaps a person could take: open or with offers, in published schedules, not started, not their own, of a kind the
 * schedule allows now, aimed at nobody or at one of their assignments, on shifts they are eligible for and not on
 * already. Each carries `myOffer`.
 */
export async function shiftsAvailableSwaps(event: H3Event, userId: number): Promise<ShiftSwapDto[]> {
  const rows = await db.select({ swap: schema.shiftSwaps, assignment: schema.shiftAssignments, shift: schema.shifts, schedule: schema.shiftSchedules })
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
    if (!allowsSwapKind(scheduleSettingsOf(row.schedule), row.swap.kind as ShiftSwapKind)) continue
    if (row.swap.wantedAssignmentId) {
      const wanted = await findShiftAssignmentEntry(row.swap.wantedAssignmentId)
      if (wanted?.assignment.userId !== userId) continue
    }
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
 * Offers on a swap. On a `trade` the offer must give one of my own future assignments back (409 `handover_not_allowed`
 * without one: that would lower the owner's count), and on a targeted trade exactly the wanted one (409 `not_wanted`). On
 * a `release` the offer takes the shift over and gives nothing back (400 with a shift). The schedule must allow the kind
 * now (409 `handover_not_allowed`). Both people must be eligible for the shift they get and break no guard (409
 * `guard_*`); one live offer per person and swap (409 `offer_exists`). Fires `shifts:swap:offered` and emails the owner.
 */
export async function shiftsOffer(event: H3Event, swap: ShiftSwapRow, userId: number, offeredAssignmentId: string | null): Promise<ShiftSwapOfferDto> {
  if (swap.status !== 'open' && swap.status !== 'offered') throw apiError(409, 'swap_closed', 'This swap takes no offers now.')
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  if (swap.userId === userId || owner.assignment.userId === userId) throw apiError(409, 'own_swap', 'You cannot offer on your own swap.')
  const kind = swap.kind as ShiftSwapKind
  if (kind === 'release' && offeredAssignmentId) {
    throw validationError([{ path: ['assignmentId'], message: 'This shift is given away: offer to take it over without a shift in return.' }])
  }
  if (kind === 'trade' && !offeredAssignmentId) {
    throw apiError(409, 'handover_not_allowed', 'This is a trade: offer one of your own shifts in return.', { kind })
  }
  shiftsAssertHandover(scheduleSettingsOf(owner.schedule), offerKind({ offeredAssignmentId }))
  if (swap.wantedAssignmentId && offeredAssignmentId !== swap.wantedAssignmentId) {
    throw apiError(409, 'not_wanted', 'This trade asks for another shift in return.', { wantedAssignmentId: swap.wantedAssignmentId })
  }
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
  // Two offers of one person at once: the earliest stays.
  const [first] = await db.select({ id: schema.shiftSwapOffers.id }).from(schema.shiftSwapOffers).where(and(
    eq(schema.shiftSwapOffers.swapId, swap.id),
    eq(schema.shiftSwapOffers.userId, userId),
    inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES),
  )).orderBy(asc(schema.shiftSwapOffers.createdAt), asc(schema.shiftSwapOffers.id)).limit(1)
  if (first && first.id !== offer!.id) {
    await db.delete(schema.shiftSwapOffers).where(eq(schema.shiftSwapOffers.id, offer!.id))
    throw apiError(409, 'offer_exists', 'You have offered on this swap already. Withdraw that offer first.')
  }
  const moved = await shiftsMoveSwap(swap, ['open', 'offered'], 'offered')
  if (!moved) {
    // The swap closed meanwhile: the offer never counted.
    await db.delete(schema.shiftSwapOffers).where(eq(schema.shiftSwapOffers.id, offer!.id))
    throw apiError(409, 'swap_closed', 'This swap takes no offers now.')
  }
  const dto = await shiftsSwapDtoOf(moved)
  const offerDto = await shiftsOfferDtoOf(dto, offer!)
  await shiftsFire('shifts:swap:offered', { event, kind: dto.kind, swap: dto, offer: offerDto })
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
    if (!await shiftsMoveSwap(swap, 'pending_approval', 'open')) {
      // An approval claimed the swap first: the offer stands and the swap is carried out.
      await shiftsMoveOffer(moved, 'withdrawn', 'accepted', { decidedAt: offer.decidedAt })
      throw apiError(409, 'swap_changed', 'The swap is being carried out.')
    }
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
  await shiftsFire('shifts:swap:rejected', { event, kind: dto.kind, swap: dto, offer: offerDto })
  await shiftsSendSwapEmail(event, 'rejected', { swap: dto, offer: offerDto, to: moved.userId })
  return offerDto
}

/**
 * The owner accepts an offer. The schedule's settings of now are checked (409 `handover_not_allowed` when they no longer
 * allow the offer, e.g. a release after `coverage` became `all`), and both directions again (409 `guard_*`); then the
 * swap is claimed with a conditional write, so two accepts at once (of the same or of two offers) carry out one: the
 * other gets a 409 `swap_changed`. The other waiting offers are not chosen (`superseded`). When both schedules involved
 * say `approval: 'peer'` the swap completes at once; when either says `'lead'` it waits for a lead of the team(s) or
 * staff (`pending_approval`), who are emailed. Fires `shifts:swap:accepted`.
 */
export async function shiftsAcceptOffer(event: H3Event, swap: ShiftSwapRow, offer: ShiftSwapOfferRow): Promise<ShiftSwapDto> {
  if (swap.status !== 'offered') throw apiError(409, 'swap_changed', `The swap is ${swap.status}.`)
  if (offer.status !== 'offered') throw apiError(409, 'offer_changed', `The offer is ${offer.status} already.`)
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  if (owner.assignment.userId !== swap.userId) throw apiError(409, 'swap_changed', 'The shift changed hands meanwhile.')
  shiftsAssertHandover(scheduleSettingsOf(owner.schedule), offerKind(offer))
  const back = offer.offeredAssignmentId ? await findShiftAssignmentEntry(offer.offeredAssignmentId) : null
  if (offer.offeredAssignmentId && !back) throw apiError(409, 'not_swappable', 'The shift offered in return no longer exists.')
  await shiftsAssertExchange(event, owner, offer.userId, back ?? null)

  const approval = shiftsNeedsLead(owner, back)
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
  if (approval) {
    const dto = await shiftsSwapDtoOf(claimed)
    const offerDto = await shiftsOfferDtoOf(dto, accepted)
    await shiftsFire('shifts:swap:accepted', { event, kind: dto.kind, swap: dto, offer: offerDto })
    await shiftsSendSwapEmail(event, 'accepted', { swap: dto, offer: offerDto, to: accepted.userId })
    for (const [lead, teamId] of await shiftsSwapApprovers(event, [owner.shift.teamId, ...(back ? [back.shift.teamId] : [])])) {
      await shiftsSendSwapEmail(event, 'pending', { swap: dto, offer: offerDto, to: lead, teamId })
    }
    return dto
  }
  // `approval: 'peer'`: `shifts:swap:accepted` fires once the exchange is done, followed by `shifts:swap:completed`; only the
  // completed email goes out.
  return shiftsCompleteSwap(event, claimed, accepted, null, { fireAccepted: true })
}

/** The explicit leads of the teams (BA and up), who approve swaps with `approval: 'lead'`, each with the team they lead. */
async function shiftsSwapApprovers(event: H3Event, teamIds: string[]): Promise<Map<number, string>> {
  const ids = new Map<number, string>()
  for (const teamId of new Set(teamIds)) {
    for (const member of await teamMembers(event, teamId, { status: true })) {
      if (teamMemberStatusGrants(member.status) && await isTeamLead(event, member.userId, teamId) && !ids.has(member.userId)) ids.set(member.userId, teamId)
    }
  }
  return ids
}

/**
 * A lead of the team(s) or staff approves a swap waiting for approval: the schedule's settings of now (409
 * `handover_not_allowed`) and the exchange (409 `guard_*`) are checked again, and it is carried out. 409 `swap_changed`
 * when it is not waiting (approved twice at once completes once).
 */
export async function shiftsApproveSwap(event: H3Event, swap: ShiftSwapRow, by: number): Promise<ShiftSwapDto> {
  if (swap.status !== 'pending_approval') throw apiError(409, 'swap_changed', `The swap is ${swap.status}.`)
  const [offer] = await db.select().from(schema.shiftSwapOffers).where(and(eq(schema.shiftSwapOffers.swapId, swap.id), eq(schema.shiftSwapOffers.status, 'accepted'))).limit(1)
  if (!offer) throw apiError(409, 'swap_changed', 'The swap has no accepted offer.')
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  if (owner.assignment.userId !== swap.userId) throw apiError(409, 'swap_changed', 'The shift changed hands meanwhile.')
  shiftsAssertHandover(scheduleSettingsOf(owner.schedule), offerKind(offer))
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
    await shiftsFire('shifts:swap:rejected', { event, kind: dto.kind, swap: dto, offer: offerDto })
    await shiftsSendSwapEmail(event, 'rejected', { swap: dto, offer: offerDto, to: rejected.userId })
    await shiftsSendSwapEmail(event, 'rejected', { swap: dto, offer: offerDto, to: dto.owner.userId })
  }
  return dto
}

/** Thrown inside a postgres transaction to roll the exchange back. */
class ShiftsExchangeConflict extends Error {}

type ShiftsExec = typeof db
type ShiftsExchange = { ownerNew: ShiftAssignmentRow, backNew: ShiftAssignmentRow | null, offer: ShiftSwapOfferRow, swap: ShiftSwapRow }

/** Whether the host runs postgres (the generated schema tells), where the exchange runs in a transaction. */
const shiftsOnPostgres = () => is(schema.shiftSwaps, PgTable)

/**
 * The writes of an exchange, every one conditional: the accepted offer must still stand; the owner's assignment must
 * still be `assigned` to the person who opened the swap (`swap.userId`), the one given back to the offerer
 * (`offer.userId`); the swap must still be `accepted`. On postgres they run in one transaction. On sqlite and D1 (no
 * interactive transactions) a failed write puts the earlier ones back, each undo conditional on the row holding what
 * this exchange wrote. `null` when the exchange did not happen.
 */
async function shiftsExchangeWrites(swap: ShiftSwapRow, offer: ShiftSwapOfferRow, approvedBy: number | null): Promise<ShiftsExchange | null> {
  const run = async (exec: ShiftsExec, undo: Array<() => Promise<unknown>>): Promise<ShiftsExchange | null> => {
    const handOver = async (id: string, from: number, to: number) => (await exec.update(schema.shiftAssignments).set({ userId: to, checkInCode: newCheckInCode() }).where(and(
      eq(schema.shiftAssignments.id, id),
      eq(schema.shiftAssignments.userId, from),
      eq(schema.shiftAssignments.status, 'assigned'),
    )).returning())[0]
    // A withdraw that won the race leaves no accepted offer.
    const [standing] = await exec.update(schema.shiftSwapOffers).set({ approvedBy: approvedBy ?? offer.approvedBy ?? null })
      .where(and(eq(schema.shiftSwapOffers.id, offer.id), eq(schema.shiftSwapOffers.status, 'accepted'))).returning()
    if (!standing) return null
    const ownerNew = await handOver(swap.assignmentId, swap.userId, offer.userId)
    if (!ownerNew) return null
    undo.push(() => exec.update(schema.shiftAssignments).set({ userId: swap.userId, checkInCode: newCheckInCode() })
      .where(and(eq(schema.shiftAssignments.id, swap.assignmentId), eq(schema.shiftAssignments.userId, offer.userId))))
    let backNew: ShiftAssignmentRow | null = null
    if (offer.offeredAssignmentId) {
      const backId = offer.offeredAssignmentId
      backNew = await handOver(backId, offer.userId, swap.userId) ?? null
      if (!backNew) return null
      undo.push(() => exec.update(schema.shiftAssignments).set({ userId: offer.userId, checkInCode: newCheckInCode() })
        .where(and(eq(schema.shiftAssignments.id, backId), eq(schema.shiftAssignments.userId, swap.userId))))
    }
    const [done] = await exec.update(schema.shiftSwaps).set({ status: 'completed', decidedAt: new Date() })
      .where(and(eq(schema.shiftSwaps.id, swap.id), eq(schema.shiftSwaps.status, 'accepted'))).returning()
    if (!done) return null
    return { ownerNew, backNew, offer: standing, swap: done }
  }
  if (shiftsOnPostgres()) {
    const transaction = (db as unknown as { transaction: <T>(work: (tx: ShiftsExec) => Promise<T>) => Promise<T> }).transaction
    try {
      return await transaction.call(db, async (tx) => {
        const result = await run(tx, [])
        if (!result) throw new ShiftsExchangeConflict()
        return result
      })
    }
    catch (error) {
      if (error instanceof ShiftsExchangeConflict) return null
      throw error
    }
  }
  const undo: Array<() => Promise<unknown>> = []
  const result = await run(db, undo)
  if (!result) for (const step of undo.reverse()) await step()
  return result
}

/**
 * Carries out a claimed (`accepted`) swap: the owner's assignment goes to the offerer and, when a shift was given back,
 * that assignment goes to the owner, each keeping its id with a new check-in code (see `shiftsExchangeWrites`). When the
 * exchange cannot happen, the offer is rejected and the swap is open again (409 `swap_changed`). Other live swaps of the
 * shift given back are cancelled and offers that gave either assignment elsewhere are withdrawn. Fires
 * `shifts:assignment:changed` twice (a trade) or once (a release), `shifts:swap:accepted` first with `approval: 'peer'`
 * (`fireAccepted`), and `shifts:swap:completed`, and emails both people.
 *
 * On sqlite and D1 a process that dies between the writes can leave a swap `accepted` with one assignment moved: the
 * owner's withdraw (after `SHIFTS_STUCK_SWAP_MS`) or staff's cancel route recovers it (`shiftsRecoverSwap`).
 */
async function shiftsCompleteSwap(event: H3Event, swap: ShiftSwapRow, offer: ShiftSwapOfferRow, approvedBy: number | null, options: { fireAccepted?: boolean } = {}): Promise<ShiftSwapDto> {
  const owner = await getShiftAssignmentEntryOr404(swap.assignmentId)
  const back = offer.offeredAssignmentId ? await findShiftAssignmentEntry(offer.offeredAssignmentId) : null
  const result = await shiftsExchangeWrites(swap, offer, approvedBy)
  if (!result) {
    // A withdrawn offer is rejected too, so a withdraw that lost the race cannot put it back on an open swap.
    await shiftsMoveOffer(offer, ['accepted', 'withdrawn'], 'rejected')
    await shiftsMoveSwap(swap, 'accepted', 'open')
    throw apiError(409, 'swap_changed', 'One of the shifts changed meanwhile, so the swap could not be carried out.')
  }
  const { ownerNew, backNew } = result

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
  const dto = await shiftsSwapDtoOf(result.swap)
  const offerDto = await shiftsOfferDtoOf(dto, result.offer)
  if (options.fireAccepted) await shiftsFire('shifts:swap:accepted', { event, kind: dto.kind, swap: dto, offer: offerDto })
  await shiftsFire('shifts:swap:completed', { event, kind: dto.kind, swap: dto, offer: offerDto })
  await shiftsSendSwapEmail(event, 'completed', { swap: dto, offer: offerDto, to: swap.userId })
  await shiftsSendSwapEmail(event, 'completed', { swap: dto, offer: offerDto, to: offer.userId })
  return dto
}

/**
 * Settles a swap stuck in `accepted` (a process died between the writes of an exchange): when every assignment moved it
 * is marked `completed`; when only one moved it is put back to the person who held it before the swap (a conditional
 * write) and the swap is `cancelled` with its offers not chosen; when nothing moved it is `cancelled`. Fires nothing:
 * the people involved see the outcome in their shifts.
 */
export async function shiftsRecoverSwap(swap: ShiftSwapRow): Promise<ShiftSwapRow> {
  const [offer] = await db.select().from(schema.shiftSwapOffers)
    .where(and(eq(schema.shiftSwapOffers.swapId, swap.id), inArray(schema.shiftSwapOffers.status, ['accepted', 'withdrawn'])))
    .orderBy(asc(schema.shiftSwapOffers.status)).limit(1)
  const ownerRow = (await findShiftAssignmentEntry(swap.assignmentId))?.assignment
  const backRow = offer?.offeredAssignmentId ? (await findShiftAssignmentEntry(offer.offeredAssignmentId))?.assignment : undefined
  const ownerMoved = !!offer && ownerRow?.userId === offer.userId
  const backMoved = !!offer && !!backRow && backRow.userId === swap.userId
  if (offer && ownerMoved && (!offer.offeredAssignmentId || backMoved)) {
    const done = await shiftsMoveSwap(swap, 'accepted', 'completed', { decidedAt: new Date() })
    await shiftsMoveOffer(offer, ['accepted', 'withdrawn'], 'accepted')
    return done ?? (await findShiftSwap(swap.id))!
  }
  if (offer && ownerMoved) {
    await db.update(schema.shiftAssignments).set({ userId: swap.userId, checkInCode: newCheckInCode() })
      .where(and(eq(schema.shiftAssignments.id, swap.assignmentId), eq(schema.shiftAssignments.userId, offer.userId)))
  }
  if (offer && backMoved && !ownerMoved) {
    await db.update(schema.shiftAssignments).set({ userId: offer.userId, checkInCode: newCheckInCode() })
      .where(and(eq(schema.shiftAssignments.id, offer.offeredAssignmentId!), eq(schema.shiftAssignments.userId, swap.userId)))
  }
  const cancelled = await shiftsMoveSwap(swap, 'accepted', 'cancelled', { decidedAt: new Date() })
  await db.update(schema.shiftSwapOffers).set({ status: 'superseded', decidedAt: new Date() })
    .where(and(eq(schema.shiftSwapOffers.swapId, swap.id), inArray(schema.shiftSwapOffers.status, [...LIVE_OFFER_STATUSES, 'withdrawn'])))
  return cancelled ?? (await findShiftSwap(swap.id))!
}

/**
 * Staff cancel a live swap, whatever its status: an `open`, `offered` or `pending_approval` one is cancelled with its
 * offers; an `accepted` one (being carried out, or stuck) is recovered (`shiftsRecoverSwap`). 409 once it is over.
 */
export async function shiftsCancelSwap(swap: ShiftSwapRow): Promise<ShiftSwapDto> {
  if (swap.status === 'accepted') return shiftsSwapDtoOf(await shiftsRecoverSwap(swap))
  const cancelled = await shiftsMoveSwap(swap, ['open', 'offered', 'pending_approval'], 'cancelled', { decidedAt: new Date() })
  if (!cancelled) throw apiError(409, 'swap_changed', `The swap is ${swap.status}.`)
  await db.update(schema.shiftSwapOffers).set({ status: 'superseded', decidedAt: new Date() })
    .where(and(eq(schema.shiftSwapOffers.swapId, swap.id), inArray(schema.shiftSwapOffers.status, LIVE_OFFER_STATUSES)))
  return shiftsSwapDtoOf(cancelled)
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

/**
 * The swaps a team's leads handle (`status` narrows them): swaps of the team's shifts, and swaps whose accepted offer
 * gives back a shift of the team. Newest first, with their offers.
 */
export async function shiftsTeamSwaps(teamId: string, status?: ShiftSwapStatus): Promise<ShiftSwapDto[]> {
  const own = await db.select({ swap: schema.shiftSwaps }).from(schema.shiftSwaps)
    .innerJoin(schema.shiftAssignments, eq(schema.shiftAssignments.id, schema.shiftSwaps.assignmentId))
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .where(and(eq(schema.shifts.teamId, teamId), status ? eq(schema.shiftSwaps.status, status) : undefined))
    .orderBy(desc(schema.shiftSwaps.openedAt)).limit(500)
  const backs = await db.select({ swap: schema.shiftSwaps }).from(schema.shiftSwapOffers)
    .innerJoin(schema.shiftSwaps, eq(schema.shiftSwaps.id, schema.shiftSwapOffers.swapId))
    .innerJoin(schema.shiftAssignments, eq(schema.shiftAssignments.id, schema.shiftSwapOffers.offeredAssignmentId))
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .where(and(eq(schema.shifts.teamId, teamId), eq(schema.shiftSwapOffers.status, 'accepted'), status ? eq(schema.shiftSwaps.status, status) : undefined))
    .limit(500)
  const rows = new Map<string, ShiftSwapRow>()
  for (const { swap } of [...own, ...backs]) rows.set(swap.id, swap)
  return shiftsSwapDtos([...rows.values()].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime()), { offers: true })
}
