import type { H3Event } from 'h3'
import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated }

/** `draft`: staff only. `published`: volunteers see their shifts and can swap them. */
export type ShiftScheduleStatus = 'draft' | 'published'

/**
 * Whether volunteers must work every shift they hold. `all`: nothing a volunteer does may lower how many shifts they hold
 * (only `trade` handovers). `flexible`: volunteers may give shifts away and take others over.
 */
export type ShiftCoverage = 'all' | 'flexible'

/** How shifts change hands between volunteers: `trade` (shift for shift), `release` (give away, or take over) or `both`. */
export type ShiftHandover = 'trade' | 'release' | 'both'

/** Who completes a swap the owner accepted: `peer` (the two volunteers' agreement is enough) or `lead` (a lead of the team or staff approves). */
export type ShiftApproval = 'peer' | 'lead'

/** How a schedule's shifts change hands. With `coverage: 'all'` only `handover: 'trade'` is valid. */
export type ShiftScheduleSettings = {
  coverage: ShiftCoverage
  handover: ShiftHandover
  approval: ShiftApproval
}

/**
 * The kind of a swap. `trade`: shift for shift; every offer gives one of the offerer's shifts back and both change hands
 * together, so each person's count stays the same. `release`: the owner gives the shift away and the offerer takes it over
 * without giving one back.
 */
export type ShiftSwapKind = 'trade' | 'release'

/** Where a person stands on a shift. Only `assigned` and `attended` count towards the capacity and the guards. */
export type ShiftAssignmentStatus = 'assigned' | 'attended' | 'no_show' | 'cancelled'

/**
 * A swap: `open` (no offers yet), `offered` (offers wait for the owner), `accepted` (an offer is being carried out),
 * `pending_approval` (accepted, waiting for a lead or staff), `completed`, `cancelled` (withdrawn by the owner, or the
 * assignment was cancelled). `rejected` is reserved: an approver's rejection puts the swap back to `open`.
 */
export type ShiftSwapStatus = 'open' | 'offered' | 'accepted' | 'pending_approval' | 'completed' | 'rejected' | 'cancelled'

/** An offer: `offered` (waiting), `accepted`, `rejected` (by the owner or an approver), `withdrawn` (by the offerer), `superseded` (another offer won or the swap ended). */
export type ShiftSwapOfferStatus = 'offered' | 'accepted' | 'rejected' | 'withdrawn' | 'superseded'

/** Limits that keep people rested. Staff assignment shows a warning; a volunteer swap that breaks one is refused. */
export type ShiftGuards = {
  /** The most shifts a person works on one day (in the module's time zone). */
  maxShiftsPerDay?: number | null
  /** The fewest hours between the end of one shift and the start of the next. */
  minRestHours?: number | null
}

/**
 * Where a shift takes place: a name, and optionally a feature of the operation's venue layout (`featureId`, the stable
 * id of a feature drawn with the plane editor of `@frigear-nu/maps`). The on-duty layer draws the shift there.
 */
export type ShiftLocation = {
  name?: Translated
  featureId?: string
}

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** My shifts (list and calendar). On by default (`/shifts`), `false` turns it off. */
      shifts?: string | boolean
      /** One of my shifts: the lead on duty, the QR pass and the swap; must contain an `:assignmentId` param. On by default (`/shifts/:assignmentId`). */
      shift?: string | boolean
      /** The swap marketplace. On by default (`/shifts/swaps`). */
      swaps?: string | boolean
      /** The check-in scanner of a team's leads; must contain a `:teamId` param. On by default (`/shifts/check-in/:teamId`). */
      checkIn?: string | boolean
      /** A team lead's page: the team's shifts, attendance and the swaps waiting for approval; must contain a `:teamId` param. On by default (`/shifts/lead/:teamId`). */
      lead?: string | boolean
    }
    /** Add a "Shifts" tab to the `admin.operations` tab area (with `@frigear-nu/widget` and `@frigear-nu/admin`). Defaults to `true`. */
    operationsTab?: boolean
  }
  /**
   * The time zone shift times are entered in: bulk creation turns `days` and `HH:mm` slots into instants in it, and the
   * guards count days in it. Defaults to `Europe/Copenhagen`.
   */
  timeZone?: string
  /** How many minutes before a shift starts its QR pass shows and check-in opens. Defaults to `60`. */
  checkInOpensMinutes?: number
  /** Reminders before a shift starts (a Nitro task, `shifts:send-reminders`). */
  reminders?: ShiftsRemindersOptions
}

export type ShiftsRemindersOptions = {
  /**
   * The cron expression the task runs on. Defaults to every ten minutes; `false` registers the task
   * without a schedule (run it yourself). On Cloudflare the module adds it to the worker's cron triggers.
   */
  cron?: string | false
  /** Minutes before a shift starts that a reminder goes out. Defaults to `[1440, 120]` (a day and two hours before). */
  offsets?: number[]
  /** Also send an SMS to people with a phone number. Defaults to `false`: SMS costs money. */
  sms?: boolean
  /**
   * The most due assignments one run handles, soonest shift first; the next run takes the rest (claims are idempotent).
   * Keeps a run inside a Workers invocation's budget. Defaults to `100`, at most `1000`.
   */
  batchSize?: number
}

export type PublicModuleOptions = {
  pages: { shifts?: string, shift?: string, swaps?: string, checkIn?: string, lead?: string }
  timeZone: string
  checkInOpensMinutes: number
}

/** The private runtime config of shifts (`runtimeConfig.shifts`). */
export type ShiftsRuntimeConfig = {
  timeZone: string
  checkInOpensMinutes: number
  /** The reminder offsets in minutes (largest first) and whether reminders also go out by SMS. */
  reminders: { offsets: number[], sms: boolean, batchSize: number }
}

/** A person as a shifts response shows them. `email` and `phone` only with `shifts:pii`. */
export type ShiftPersonDto = {
  userId: number
  name: string | null
  avatar: string | null
  email?: string | null
  phone?: string | null
}

export type ShiftScheduleDto = {
  id: string
  operationId: string
  name: Translated
  status: ShiftScheduleStatus
  coverage: ShiftCoverage
  handover: ShiftHandover
  approval: ShiftApproval
  minPerShift: number | null
  maxPerShift: number | null
  guards: ShiftGuards
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  /** In lists: how many shifts the schedule has. */
  shiftCount?: number
}

export type ShiftRoleDto = {
  id: string
  scheduleId: string
  teamId: string
  teamRole: string | null
  name: Translated
  createdAt: string
}

export type ShiftDto = {
  id: string
  scheduleId: string
  operationId: string
  teamId: string
  shiftRoleId: string | null
  startsAt: string
  endsAt: string
  location: ShiftLocation | null
  /** As stored: `null` falls back to the schedule's `maxPerShift`. */
  capacity: number | null
  /** The capacity that applies (`capacity`, else the schedule's `maxPerShift`); `null` is unlimited. */
  effectiveCapacity: number | null
  notes: Translated | null
  createdAt: string
  updatedAt: string
}

export type ShiftAssignmentDto = {
  id: string
  shiftId: string
  userId: number
  shiftRoleId: string | null
  status: ShiftAssignmentStatus
  checkedInAt: string | null
  checkedInBy: number | null
  assignedBy: number | null
  createdAt: string
  updatedAt: string
}

/** An assignment with its person, in staff and lead views. */
export type ShiftAssigneeDto = ShiftAssignmentDto & { person: ShiftPersonDto }

/** A shift with its assignments, in staff and lead views. */
export type ShiftWithAssigneesDto = ShiftDto & {
  teamName: Translated
  assignees: ShiftAssigneeDto[]
  /** People on it now: `assigned` and `attended`. */
  filled: number
}

/** A guard a new assignment (or a swap) would break, or the capacity. A swap answers 409 with the matching `ShiftSwapGuardCode`. */
export type ShiftWarning = {
  code: 'shift_full' | 'below_min' | 'max_shifts_per_day' | 'min_rest' | 'overlap'
  message: string
  /** The other shift involved (`min_rest`, `overlap`). */
  shiftId?: string
}

/**
 * The 409 codes of a swap one of the two people cannot take part in: two shifts at once, too little rest, too many shifts
 * on one day, not eligible for the shift (team or role), or a shift over its capacity.
 */
export type ShiftSwapGuardCode = 'guard_overlap' | 'guard_rest' | 'guard_max_per_day' | 'guard_ineligible' | 'guard_capacity'

/** The answer of assigning someone: the assignment and the guards it breaks (staff decide; only a full shift blocks). */
export type ShiftAssignResultDto = {
  assignment: ShiftAssigneeDto
  warnings: ShiftWarning[]
}

/** A person staff could assign to a shift (`GET /api/admin/shifts/:shiftId/candidates`). */
export type ShiftCandidateDto = ShiftPersonDto & {
  role: string
  eligible: boolean
  /** Why not eligible: `role` (below the shift role's team role) or `assigned` (on the shift already). */
  reason: 'role' | 'assigned' | null
  warnings: ShiftWarning[]
}

/** A swap as people see it. */
export type ShiftSwapDto = {
  id: string
  assignmentId: string
  kind: ShiftSwapKind
  status: ShiftSwapStatus
  openedAt: string
  decidedAt: string | null
  /** The shift on offer. */
  shift: ShiftDto & { teamName: Translated, scheduleName: Translated }
  /** The person giving it away (name only). */
  owner: ShiftPersonDto
  /** A trade aimed at one assignment: only its holder may offer, and only that shift. `null` is open to anybody. */
  wantedAssignmentId: string | null
  /** The shift the owner wants in return, for a targeted trade. */
  wantedShift: (ShiftDto & { teamName: Translated }) | null
  /** The schedule's settings now (they may have changed since the swap was opened). */
  settings: ShiftScheduleSettings
  /** In the owner's and staff's views: the offers. */
  offers?: ShiftSwapOfferDto[]
  /** In the marketplace: the caller's own live offer, if any. */
  myOffer?: ShiftSwapOfferDto | null
}

export type ShiftSwapOfferDto = {
  id: string
  swapId: string
  userId: number
  person?: ShiftPersonDto
  offeredAssignmentId: string | null
  /** The shift given back in return, when there is one. */
  offeredShift?: (ShiftDto & { teamName: Translated }) | null
  status: ShiftSwapOfferStatus
  decidedAt: string | null
  approvedBy: number | null
  createdAt: string
}

/** One of my shifts (`GET /api/shifts/me`). */
export type MyShiftDto = {
  assignment: ShiftAssignmentDto
  shift: ShiftDto
  operationId: string
  operationName: Translated
  scheduleName: Translated
  teamName: Translated
  roleName: Translated | null
  /** My live swap of it, if any. */
  swap: Pick<ShiftSwapDto, 'id' | 'status' | 'kind'> | null
  /** How the schedule lets this shift change hands. */
  settings: ShiftScheduleSettings
}

/** One of my shifts with what the detail page shows (`GET /api/shifts/me/:assignmentId`). */
export type MyShiftDetailDto = MyShiftDto & {
  /** The leads of the team on shift at the same time (names only). */
  leadsOnDuty: ShiftPersonDto[]
  /** My live swap with its offers. */
  swapDetail: ShiftSwapDto | null
  /** When the QR pass shows: from `startsAt` minus `checkInOpensMinutes` to `endsAt`. */
  passOpensAt: string
  passClosesAt: string
}

/** The QR pass of an assignment (`GET /api/shifts/me/:assignmentId/pass`). `code` and `svg` only inside the window. */
export type ShiftPassDto = {
  assignmentId: string
  available: boolean
  opensAt: string
  closesAt: string
  code: string | null
  /** The QR code as an SVG document. */
  svg: string | null
  /** The perks of the operation this person may still get, with what is left of each (also while the pass is closed). */
  perks: ShiftPassPerkDto[]
}

/** The answer of a check-in (`POST /api/shifts/teams/:teamId/check-in`). */
export type ShiftCheckInDto = {
  ok: true
  alreadyCheckedIn: boolean
  checkedInAt: string
  assignment: ShiftAssigneeDto
  shift: ShiftDto
}

/** Who is on shift now in an operation (`GET /api/shifts/operations/:operationId/now`). */
export type ShiftsNowDto = {
  operationId: string
  at: string
  teams: Array<{
    teamId: string
    teamName: Translated
    /** The leads (BA and up) on shift now. */
    leads: ShiftPersonDto[]
    shifts: Array<ShiftDto & { assignees: ShiftAssigneeDto[] }>
  }>
}

/**
 * The teams of mine that are on shift now (`GET /api/shifts/me/now`): for each operation I work at, the teams I hold a
 * role on that have a shift running, with who is on it and the leads among them. Names only, never contact details.
 */
export type ShiftsMyNowDto = {
  at: string
  teams: Array<{
    operationId: string
    operationName: Translated
    teamId: string
    teamName: Translated
    /** The leads (BA and up) on shift now. */
    leads: ShiftPersonDto[]
    /** Everybody on shift now in this team, the leads included. */
    people: ShiftPersonDto[]
  }>
}

/** The answer of copying a schedule's roles and shifts (`POST /api/admin/shifts/schedules/:scheduleId/copy-from`). */
export type ShiftCopyResultDto = {
  schedule: ShiftScheduleDto
  roles: number
  shifts: number
  /** Teams of the source with no team of the same name in this operation: their roles and shifts were not copied. */
  skippedTeamIds: string[]
  /** Roles of the source whose minimum team role is not on the target team kind's ladder: copied without one. */
  changedRoleIds: string[]
}

/** A team the caller leads (`GET /api/shifts/me/leads`): where the lead page and the scanner apply. */
export type ShiftsLedTeamDto = {
  teamId: string
  teamName: Translated
  operationId: string
  operationName: Translated
}

/** A team of an operation with its kind's ladder (`GET /api/admin/shifts/operations/:operationId/teams`). */
export type ShiftsOperationTeamDto = {
  id: string
  kind: string
  name: Translated
  ladder: { roles: Array<{ key: string, label: Translated }>, leadFrom: string | null } | null
}

/** Context of `shifts:schedule:published`. */
export type ShiftScheduleContext = { event: H3Event, schedule: ShiftScheduleDto }
/** Context of `shifts:shift:created`. */
export type ShiftCreatedContext = { event: H3Event, shift: ShiftDto }
/** Context of `shifts:shift:updated`. */
export type ShiftUpdatedContext = { event: H3Event, shift: ShiftDto, previous: ShiftDto }
/** Context of `shifts:assignment:changed`. `previous` is `null` for a new assignment. */
export type ShiftAssignmentChangedContext = { event: H3Event, assignment: ShiftAssignmentDto, previous: ShiftAssignmentDto | null }
/** Context of `shifts:swap:offered`, `:accepted`, `:rejected` and `:completed`. `kind` is the swap's (`swap.kind`). */
export type ShiftSwapContext = { event: H3Event, kind: ShiftSwapKind, swap: ShiftSwapDto, offer: ShiftSwapOfferDto }
/** Context of `shifts:attendance:marked`. `by` is the lead or staff user. */
export type ShiftAttendanceContext = { event: H3Event, assignment: ShiftAssignmentDto, by: number }

/** Context of `shifts:reminder:sent`. A scheduled task has no request: `event` is `undefined` there. */
export type ShiftReminderContext = { event: H3Event | undefined, assignment: ShiftAssignmentDto, offset: number, channels: ShiftChannel[] }
/** Context of `shifts:broadcast:sent`. */
export type ShiftBroadcastContext = { event: H3Event, broadcast: ShiftBroadcastDto }
/** Context of `shifts:perk:redeemed`. */
export type ShiftPerkContext = { event: H3Event, perk: ShiftPerkDto, redemption: ShiftPerkRedemptionDto }

/** How a reminder or broadcast reaches people. */
export type ShiftChannel = 'email' | 'sms' | 'push'

/** The state of my calendar feed (`GET /api/shifts/me/feed-token`): the secret itself is never shown again. */
export type ShiftFeedStatusDto = {
  active: boolean
  prefix: string | null
  createdAt: string | null
  lastUsedAt: string | null
}

/** A freshly minted calendar feed (`POST /api/shifts/me/feed-token`): shown once. */
export type ShiftFeedTokenDto = {
  token: string
  /** The https address of the feed (`.ics`). */
  url: string
  /** The same address as `webcal://`, which calendar apps open as a subscription. */
  webcalUrl: string
}

/** Who a broadcast goes to: members of the operation's teams (`teamId` narrows to one, `teamRole` to a role and up), or the people on one shift. */
export type ShiftBroadcastAudience = {
  teamId?: string
  teamRole?: string
  shiftId?: string
}

export type ShiftBroadcastDto = {
  id: string
  operationId: string
  teamId: string | null
  shiftId: string | null
  teamRole: string | null
  channels: ShiftChannel[]
  subject: Translated
  message: Translated
  recipientCount: number
  sentBy: number
  createdAt: string
}

/** The answer of sending a broadcast: what was stored and how many messages went out per channel (once delivered). */
export type ShiftBroadcastResultDto = ShiftBroadcastDto & {
  sent: { email: number, sms: number, push: number }
  /** `done`: delivered before the answer. `queued`: handed to the platform's `waitUntil`, so `sent` is not known yet (zeros). */
  delivery: 'done' | 'queued'
}

export type ShiftPerkKind = 'meal' | 'drink' | 'other'

/** A perk: `perShift` is the allowance of each assignment, `perPerson` the budget of each person across the operation (exactly one is set). */
export type ShiftPerkDto = {
  id: string
  operationId: string
  teamId: string | null
  kind: ShiftPerkKind
  name: Translated
  perShift: number | null
  perPerson: number | null
  createdAt: string
  updatedAt: string
  /** In staff lists: how many times it was redeemed. */
  redeemed?: number
}

export type ShiftPerkRedemptionDto = {
  id: string
  perkId: string
  assignmentId: string
  userId: number
  redeemedAt: string
  redeemedBy: number
}

/** A perk on a pass: the allowance that applies to me and what is left. */
export type ShiftPassPerkDto = {
  perkId: string
  kind: ShiftPerkKind
  name: Translated
  /** `shift`: the allowance of this assignment. `person`: my budget across the operation. */
  per: 'shift' | 'person'
  limit: number
  used: number
  remaining: number
}

/** The answer of redeeming a perk (`POST /api/shifts/teams/:teamId/perks/:perkId/redeem`). */
export type ShiftPerkRedeemDto = {
  ok: true
  perk: ShiftPerkDto
  redemption: ShiftPerkRedemptionDto
  /** What is left of the allowance that applied, after this redemption. */
  remaining: number
  limit: number
  person: ShiftPersonDto
  shift: ShiftDto
}
