import { pgTable, text, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

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

/** A schedule of an operation: its shifts, the roles they need, how swaps work and the guards. */
export const shiftSchedules = pgTable('shift_schedules', {
  /** `shs_` + random id. */
  id: text().primaryKey(),
  operationId: text().notNull(),
  name: jsonb().$type<Translated>().notNull(),
  /** `draft` (staff only) or `published` (volunteers see their shifts). */
  status: text().notNull().default('draft'),
  /** `peer`: a swap completes when the owner accepts an offer. `approval`: a lead or staff approves it too. */
  swapMode: text().notNull().default('peer'),
  /** Fewer people than this on a shift shows it as short-staffed. */
  minPerShift: integer(),
  /** The capacity of a shift that sets none; `null` is unlimited. */
  maxPerShift: integer(),
  guards: jsonb().$type<ShiftGuards>(),
  publishedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_schedule_operation_idx').on(t.operationId),
])

/** A role a schedule staffs on one team, with the lowest team role that may hold it (`ba` for a BA shift). */
export const shiftRoles = pgTable('shift_roles', {
  /** `shr_` + random id. */
  id: text().primaryKey(),
  scheduleId: text().notNull(),
  teamId: text().notNull(),
  /** The lowest role of the team kind's ladder that may hold it; `null` is anybody on the team. */
  teamRole: text(),
  name: jsonb().$type<Translated>().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('shift_role_schedule_idx').on(t.scheduleId),
])

/** One shift: a team, a time and how many people it needs. */
export const shifts = pgTable('shifts', {
  /** `shf_` + random id. */
  id: text().primaryKey(),
  scheduleId: text().notNull(),
  teamId: text().notNull(),
  /** The role a new assignment holds unless staff pick another; `null` is anybody on the team. */
  shiftRoleId: text(),
  startsAt: timestamp({ withTimezone: true }).notNull(),
  endsAt: timestamp({ withTimezone: true }).notNull(),
  location: jsonb().$type<ShiftLocation>(),
  /** How many people the shift takes; `null` is the schedule's `maxPerShift`. */
  capacity: integer(),
  notes: jsonb().$type<Translated>(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_schedule_start_idx').on(t.scheduleId, t.startsAt),
  index('shift_team_start_idx').on(t.teamId, t.startsAt),
])

/** A person on a shift. One active (not cancelled) assignment per person and shift, enforced in code. */
export const shiftAssignments = pgTable('shift_assignments', {
  /** `sha_` + random id. */
  id: text().primaryKey(),
  shiftId: text().notNull(),
  userId: integer().notNull(),
  shiftRoleId: text(),
  /** `assigned`, `attended`, `no_show` or `cancelled`. */
  status: text().notNull().default('assigned'),
  /** The code of the QR pass: 64 hex characters, unguessable. A new one is issued when the assignment changes hands. */
  checkInCode: text().notNull(),
  checkedInAt: timestamp({ withTimezone: true }),
  checkedInBy: integer(),
  assignedBy: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('shift_assignment_code_unique').on(t.checkInCode),
  index('shift_assignment_shift_idx').on(t.shiftId),
  index('shift_assignment_user_idx').on(t.userId),
])

/** A swap a person opened on one of their assignments. */
export const shiftSwaps = pgTable('shift_swaps', {
  /** `shw_` + random id. */
  id: text().primaryKey(),
  assignmentId: text().notNull(),
  /** The person who opened it: the assignment's holder then. */
  userId: integer().notNull(),
  /** `open`, `offered`, `accepted`, `pending_approval`, `completed`, `rejected` or `cancelled`. */
  status: text().notNull().default('open'),
  openedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  decidedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_swap_assignment_idx').on(t.assignmentId),
  index('shift_swap_status_idx').on(t.status),
])

/** An offer on a swap: take the shift over, optionally giving one of your own shifts back. */
export const shiftSwapOffers = pgTable('shift_swap_offers', {
  /** `sho_` + random id. */
  id: text().primaryKey(),
  swapId: text().notNull(),
  userId: integer().notNull(),
  /** The offerer's assignment the owner gets in return; `null` takes the shift over without giving one back. */
  offeredAssignmentId: text(),
  /** `offered`, `accepted`, `rejected`, `withdrawn` or `superseded`. */
  status: text().notNull().default('offered'),
  decidedAt: timestamp({ withTimezone: true }),
  /** The lead or staff user who approved the swap (approval mode). */
  approvedBy: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_swap_offer_swap_idx').on(t.swapId),
  index('shift_swap_offer_user_idx').on(t.userId),
])
