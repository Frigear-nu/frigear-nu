import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// The guards of a schedule, see `ShiftGuards` in types.ts.
type ShiftGuards = { maxShiftsPerDay?: number | null, minRestHours?: number | null }
// Where a shift takes place, see `ShiftLocation` in types.ts.
type ShiftLocation = { name?: Translated, mapId?: string, featureId?: string }

// Operation, team and user ids carry no foreign key here: those tables belong to other modules. Shifts' own rows refer to
// each other by id and are removed by shifts itself.

/** A schedule of an operation: its shifts, the roles they need, how shifts change hands and the guards. */
export const shiftSchedules = sqliteTable('shift_schedules', {
  /** `shs_` + random id. */
  id: text().primaryKey(),
  operationId: text().notNull(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** `draft` (staff only) or `published` (volunteers see their shifts). */
  status: text().notNull().default('draft'),
  /** `all`: volunteers work every shift they hold, nothing they do lowers their count (trades only). `flexible`. */
  coverage: text().notNull().default('flexible'),
  /** How shifts change hands: `trade` (shift for shift), `release` (give away or take over) or `both`. */
  handover: text().notNull().default('both'),
  /** `peer`: a swap completes when the owner accepts an offer. `lead`: a lead of the team or staff approves it too. */
  approval: text().notNull().default('peer'),
  /** Fewer people than this on a shift shows it as short-staffed. */
  minPerShift: integer(),
  /** The capacity of a shift that sets none; `null` is unlimited. */
  maxPerShift: integer(),
  guards: text({ mode: 'json' }).$type<ShiftGuards>(),
  publishedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_schedule_operation_idx').on(t.operationId),
])

/** A role a schedule staffs on one team, with the lowest team role that may hold it (`ba` for a BA shift). */
export const shiftRoles = sqliteTable('shift_roles', {
  /** `shr_` + random id. */
  id: text().primaryKey(),
  scheduleId: text().notNull(),
  teamId: text().notNull(),
  /** The lowest role of the team kind's ladder that may hold it; `null` is anybody on the team. */
  teamRole: text(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('shift_role_schedule_idx').on(t.scheduleId),
])

/** One shift: a team, a time and how many people it needs. */
export const shifts = sqliteTable('shifts', {
  /** `shf_` + random id. */
  id: text().primaryKey(),
  scheduleId: text().notNull(),
  teamId: text().notNull(),
  /** The role a new assignment holds unless staff pick another; `null` is anybody on the team. */
  shiftRoleId: text(),
  startsAt: integer({ mode: 'timestamp' }).notNull(),
  endsAt: integer({ mode: 'timestamp' }).notNull(),
  location: text({ mode: 'json' }).$type<ShiftLocation>(),
  /** How many people the shift takes; `null` is the schedule's `maxPerShift`. */
  capacity: integer(),
  notes: text({ mode: 'json' }).$type<Translated>(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_schedule_start_idx').on(t.scheduleId, t.startsAt),
  index('shift_team_start_idx').on(t.teamId, t.startsAt),
])

/** A person on a shift. One active (not cancelled) assignment per person and shift, enforced in code. */
export const shiftAssignments = sqliteTable('shift_assignments', {
  /** `sha_` + random id. */
  id: text().primaryKey(),
  shiftId: text().notNull(),
  userId: integer().notNull(),
  shiftRoleId: text(),
  /** `assigned`, `attended`, `no_show` or `cancelled`. */
  status: text().notNull().default('assigned'),
  /** The code of the QR pass: 64 hex characters, unguessable. A new one is issued when the assignment changes hands. */
  checkInCode: text().notNull(),
  checkedInAt: integer({ mode: 'timestamp' }),
  checkedInBy: integer(),
  assignedBy: integer(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('shift_assignment_code_unique').on(t.checkInCode),
  index('shift_assignment_shift_idx').on(t.shiftId),
  index('shift_assignment_user_idx').on(t.userId),
])

/** A swap a person opened on one of their assignments. */
export const shiftSwaps = sqliteTable('shift_swaps', {
  /** `shw_` + random id. */
  id: text().primaryKey(),
  assignmentId: text().notNull(),
  /** The person who opened it: the assignment's holder then. */
  userId: integer().notNull(),
  /** `trade` (shift for shift: every offer gives one back) or `release` (given away, taken over). */
  kind: text().notNull().default('release'),
  /** A trade aimed at one assignment: only its holder may offer, giving that shift. `null` is open to anybody. */
  wantedAssignmentId: text(),
  /** `open`, `offered`, `accepted`, `pending_approval`, `completed`, `rejected` or `cancelled`. */
  status: text().notNull().default('open'),
  openedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  decidedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_swap_assignment_idx').on(t.assignmentId),
  index('shift_swap_status_idx').on(t.status),
])

/** An offer on a swap: one of the offerer's shifts in return (a trade), or none (taking a released shift over). */
export const shiftSwapOffers = sqliteTable('shift_swap_offers', {
  /** `sho_` + random id. */
  id: text().primaryKey(),
  swapId: text().notNull(),
  userId: integer().notNull(),
  /** The offerer's assignment the owner gets in return (a trade); `null` takes a released shift over. */
  offeredAssignmentId: text(),
  /** `offered`, `accepted`, `rejected`, `withdrawn` or `superseded`. */
  status: text().notNull().default('offered'),
  decidedAt: integer({ mode: 'timestamp' }),
  /** The lead or staff user who approved the swap (`approval: 'lead'`). */
  approvedBy: integer(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_swap_offer_swap_idx').on(t.swapId),
  index('shift_swap_offer_user_idx').on(t.userId),
])
