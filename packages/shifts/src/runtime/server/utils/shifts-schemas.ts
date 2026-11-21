import { z } from 'zod'
import { mapLocationSchema } from '@frigear-nu/maps/schemas'
import { SHIFT_CHECK_IN_MODES } from '../../utils/checkin'
import { SHIFT_APPROVALS, SHIFT_COVERAGES, SHIFT_HANDOVERS, SHIFT_SWAP_KINDS } from '../../utils/settings'
import { SHIFT_SWAP_STATUSES } from '../../utils/status'
import { isClock, isDay } from '../../utils/time'

const key = z.string().trim().min(1).max(64)

// One text for every language, or a locale -> text map. Empty entries are dropped.
const shiftsTranslated = z.union([
  z.string().trim().min(1).max(500),
  z.record(z.string(), z.string().max(500))
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

const longTranslated = z.union([
  z.string().trim().max(4000),
  z.record(z.string(), z.string().max(4000))
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim()))),
])

const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))
const count = z.number().int().min(0).max(10_000)

const guards = z.strictObject({
  maxShiftsPerDay: z.number().int().min(1).max(24).nullish(),
  minRestHours: z.number().min(0).max(72).nullish(),
})

const checkInModes = z.array(z.enum(SHIFT_CHECK_IN_MODES)).max(SHIFT_CHECK_IN_MODES.length).transform(value => [...new Set(value)])

/** How people check in on a schedule's shifts, with overrides per team (keyed by team id, at most 200). */
const checkIn = z.strictObject({
  modes: checkInModes,
  location: mapLocationSchema.nullish(),
  teams: z.record(key, z.strictObject({ modes: checkInModes.optional(), location: mapLocationSchema.nullish() }))
    .refine(value => Object.keys(value).length <= 200, 'At most 200 team overrides.')
    .optional(),
})

const autoNoShowMinutes = z.number().int().min(0).max(24 * 60)

const location = z.strictObject({
  name: shiftsTranslated.optional(),
  featureId: key.optional(),
})

/**
 * The body of `POST /api/admin/shifts/schedules`. `coverage: 'all'` with a `handover` other than `trade` is refused
 * with 400 `invalid_schedule_settings` (checked by `shiftsCreateSchedule`, so the code is stable).
 */
export const shiftsScheduleInput = z.object({
  operationId: key,
  name: shiftsTranslated,
  coverage: z.enum(SHIFT_COVERAGES).default('flexible'),
  handover: z.enum(SHIFT_HANDOVERS).default('both'),
  approval: z.enum(SHIFT_APPROVALS).default('peer'),
  minPerShift: count.nullish(),
  maxPerShift: count.nullish(),
  guards: guards.nullish(),
  checkIn: checkIn.nullish(),
  autoNoShow: z.boolean().default(false),
  autoNoShowMinutes: autoNoShowMinutes.default(30),
}).refine(value => value.minPerShift == null || value.maxPerShift == null || value.maxPerShift >= value.minPerShift, {
  message: 'The maximum must be at least the minimum.',
  path: ['maxPerShift'],
})

/** The body of `PATCH /api/admin/shifts/schedules/:scheduleId`. The settings are checked merged with the stored ones. */
export const shiftsSchedulePatch = z.object({
  name: shiftsTranslated.optional(),
  coverage: z.enum(SHIFT_COVERAGES).optional(),
  handover: z.enum(SHIFT_HANDOVERS).optional(),
  approval: z.enum(SHIFT_APPROVALS).optional(),
  minPerShift: count.nullish(),
  maxPerShift: count.nullish(),
  guards: guards.nullish(),
  checkIn: checkIn.nullish(),
  autoNoShow: z.boolean().optional(),
  autoNoShowMinutes: autoNoShowMinutes.optional(),
})

/** The query of `GET /api/admin/shifts/schedules`. */
export const shiftsScheduleQuery = z.object({ operationId: key.optional() })

/** The body of `POST /api/admin/shifts/schedules/:scheduleId/copy-from`. */
export const shiftsCopyInput = z.object({
  scheduleId: key,
  /** Whole days the copied shifts move by, at the same wall-clock time (365 for a year on). */
  offsetDays: z.number().int().min(-3660).max(3660).default(0),
})

/** The body of `POST /api/admin/shifts/schedules/:scheduleId/roles`. */
export const shiftsRoleInput = z.object({
  teamId: key,
  teamRole: key.nullish(),
  name: shiftsTranslated,
})

/** The body of `PATCH /api/admin/shifts/roles/:roleId`. */
export const shiftsRolePatch = z.object({
  teamRole: key.nullish(),
  name: shiftsTranslated.optional(),
})

const day = z.string().refine(isDay, 'Use a YYYY-MM-DD day.')
const clock = z.string().refine(isClock, 'Use an HH:mm time.')

/** The body of `POST /api/admin/shifts/schedules/:scheduleId/shifts/bulk`: every slot on every day, in the module's time zone. */
export const shiftsBulkInput = z.object({
  teamId: key,
  days: z.array(day).min(1).max(62),
  slots: z.array(z.object({ start: clock, end: clock })).min(1).max(24),
  capacity: count.nullish(),
  shiftRoleId: key.nullish(),
  location: location.nullish(),
  notes: longTranslated.nullish(),
}).refine(value => value.days.length * value.slots.length <= 500, { message: 'At most 500 shifts at once.', path: ['days'] })

/** The body of `PATCH /api/admin/shifts/:shiftId`. */
export const shiftsShiftPatch = z.object({
  teamId: key.optional(),
  shiftRoleId: key.nullish(),
  startsAt: date.optional(),
  endsAt: date.optional(),
  capacity: count.nullish(),
  location: location.nullish(),
  notes: longTranslated.nullish(),
})

/** The query of the shift lists (`?teamId&from&to`). */
export const shiftsRangeQuery = z.object({
  teamId: key.optional(),
  from: date.optional(),
  to: date.optional(),
})

/** The body of `POST /api/admin/shifts/:shiftId/assignments`. */
export const shiftsAssignInput = z.object({
  userId: z.number().int().positive(),
  shiftRoleId: key.nullish(),
  /** Assign over the capacity (`shifts:manage` only). */
  force: z.boolean().default(false),
})

/** The query of `GET /api/admin/shifts/:shiftId/candidates`. */
export const shiftsCandidatesQuery = z.object({
  q: z.string().trim().max(200).optional(),
  // The shift role the person would hold; the shift's own role when left out.
  shiftRoleId: key.optional(),
})

/** The body of `POST /api/shifts/teams/:teamId/check-in`. */
export const shiftsCheckInInput = z.object({ code: z.string().trim().min(1).max(200) })

/**
 * The body of `POST /api/shifts/me/:assignmentId/swap`: the kind (the schedule's only allowed kind, else `release`, when
 * left out) and, for a trade, the one assignment wanted in return.
 */
export const shiftsOpenSwapInput = z.object({
  kind: z.enum(SHIFT_SWAP_KINDS).optional(),
  wantedAssignmentId: key.nullish(),
}).prefault({})

/** The body of `POST /api/shifts/swaps/:swapId/offers`: one of my own assignments in return (a trade), or none (a release). */
export const shiftsOfferInput = z.object({ assignmentId: key.nullish() }).prefault({})

/** The router params of `/api/shifts/swaps/:swapId/offers/:offerId`. */
export const shiftsOfferParams = z.object({ swapId: z.string().trim().min(1), offerId: z.string().trim().min(1) })

/** The query of `GET /api/admin/shifts/swaps`. */
export const shiftsSwapsQuery = z.object({
  operationId: key.optional(),
  status: z.enum(SHIFT_SWAP_STATUSES).optional(),
})

/** A text for people to read, in one language or several, at most `max` characters each, with at least one non-empty. */
const messageText = (max: number) => z.union([
  z.string().trim().min(1).max(max),
  z.record(z.string(), z.string().max(max))
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

const broadcastFields = {
  audience: z.strictObject({
    teamId: key.optional(),
    /** The lowest team role (on each team kind's ladder) that gets it; every member when left out. */
    teamRole: key.optional(),
    shiftId: key.optional(),
  }).prefault({}),
  // Email is the default; SMS costs money, so it is only sent when asked for.
  channels: z.array(z.enum(['email', 'sms'])).min(1).max(2).default(['email']).transform(value => [...new Set(value)]),
  subject: messageText(200),
  message: messageText(1500),
}

/** The body of `POST /api/admin/shifts/broadcasts`. */
export const shiftsBroadcastInput = z.object({ operationId: key, ...broadcastFields })

/** The body of `POST /api/shifts/teams/:teamId/broadcasts`: the operation is the team's. */
export const shiftsLeadBroadcastInput = z.object(broadcastFields)

/** The query of `GET /api/admin/shifts/broadcasts`. */
export const shiftsBroadcastsQuery = z.object({ operationId: key })

const perkQuantity = z.number().int().min(1).max(1000)
const voucherType = z.string().trim().min(1).max(64)

/** The body of `POST /api/admin/shifts/operations/:operationId/perks`. */
export const shiftsPerkInput = z.object({
  teamId: key.nullish(),
  name: shiftsTranslated,
  voucherType,
  quantity: perkQuantity.default(1),
})

/** The body of `PATCH /api/admin/shifts/perks/:perkId`. Changes apply to grants made from now on. */
export const shiftsPerkPatch = z.object({
  teamId: key.nullish(),
  name: shiftsTranslated.optional(),
  voucherType: voucherType.optional(),
  quantity: perkQuantity.optional(),
})

/** The query of `GET /api/shifts/me/perk-grants`. */
export const shiftsPerkGrantsQuery = z.object({ status: z.enum(['unclaimed', 'claimed', 'all']).default('unclaimed') })

/** The optional body of `POST /api/shifts/me/perk-grants/:id/claim`. */
export const shiftsPerkClaimInput = z.object({ client: z.string().trim().min(1).max(100).optional() }).prefault({})

/** The body of `POST /api/admin/shifts/schedules/:scheduleId/stations`. */
export const shiftsStationInput = z.object({
  teamId: key,
  name: shiftsTranslated,
  featureId: key.nullish(),
})

/** The body of `PATCH /api/admin/shifts/stations/:stationId`. */
export const shiftsStationPatch = z.object({
  name: shiftsTranslated.optional(),
  featureId: key.nullish(),
})

/** The body of `POST /api/shifts/me/:assignmentId/check-in`: a station's QR token, or the device's position. */
export const shiftsSelfCheckInInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('station'), token: z.string().trim().min(1).max(300) }),
  z.object({
    mode: z.literal('location'),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    /** The accuracy the device reports, in metres. */
    accuracy: z.number().min(0).max(100_000),
  }),
])

/** The query of `GET /api/shifts/teams/:teamId/swaps`. */
export const shiftsTeamSwapsQuery = z.object({ status: z.enum(SHIFT_SWAP_STATUSES).optional() })
