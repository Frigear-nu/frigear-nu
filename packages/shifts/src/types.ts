import type { H3Event } from 'h3'
import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated }

/** `draft`: staff only. `published`: volunteers see their shifts and can swap them. */
export type ShiftScheduleStatus = 'draft' | 'published'

/** `peer`: a swap completes when the owner accepts an offer. `approval`: a lead of the team or staff approves it too. */
export type ShiftSwapMode = 'peer' | 'approval'

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

/** Where a shift takes place: a name, and optionally a feature of a map (the maps layer comes later). */
export type ShiftLocation = {
  name?: Translated
  mapId?: string
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
  swapMode: ShiftSwapMode
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

/** A guard a new assignment (or a swap) would break, or the capacity. */
export type ShiftWarning = {
  code: 'shift_full' | 'below_min' | 'max_shifts_per_day' | 'min_rest' | 'overlap'
  message: string
  /** The other shift involved (`min_rest`, `overlap`). */
  shiftId?: string
}

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
  status: ShiftSwapStatus
  openedAt: string
  decidedAt: string | null
  /** The shift on offer. */
  shift: ShiftDto & { teamName: Translated, scheduleName: Translated }
  /** The person giving it away (name only). */
  owner: ShiftPersonDto
  swapMode: ShiftSwapMode
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
  swap: Pick<ShiftSwapDto, 'id' | 'status'> | null
}

/** One of my shifts with what the detail page shows (`GET /api/shifts/me/:assignmentId`). */
export type MyShiftDetailDto = MyShiftDto & {
  /** The leads of the team on shift at the same time (names only). */
  leadsOnDuty: ShiftPersonDto[]
  swapMode: ShiftSwapMode
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
/** Context of `shifts:swap:offered`, `:accepted`, `:rejected` and `:completed`. */
export type ShiftSwapContext = { event: H3Event, swap: ShiftSwapDto, offer: ShiftSwapOfferDto }
/** Context of `shifts:attendance:marked`. `by` is the lead or staff user. */
export type ShiftAttendanceContext = { event: H3Event, assignment: ShiftAssignmentDto, by: number }
