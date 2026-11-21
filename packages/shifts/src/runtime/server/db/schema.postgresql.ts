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

/** A schedule of an operation: its shifts, the roles they need, how shifts change hands and the guards. */
export const shiftSchedules = pgTable('shift_schedules', {
  /** `shs_` + random id. */
  id: text().primaryKey(),
  operationId: text().notNull(),
  name: jsonb().$type<Translated>().notNull(),
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
  /** `trade` (shift for shift: every offer gives one back) or `release` (given away, taken over). */
  kind: text().notNull().default('release'),
  /** A trade aimed at one assignment: only its holder may offer, giving that shift. `null` is open to anybody. */
  wantedAssignmentId: text(),
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

/** An offer on a swap: one of the offerer's shifts in return (a trade), or none (taking a released shift over). */
export const shiftSwapOffers = pgTable('shift_swap_offers', {
  /** `sho_` + random id. */
  id: text().primaryKey(),
  swapId: text().notNull(),
  userId: integer().notNull(),
  /** The offerer's assignment the owner gets in return (a trade); `null` takes a released shift over. */
  offeredAssignmentId: text(),
  /** `offered`, `accepted`, `rejected`, `withdrawn` or `superseded`. */
  status: text().notNull().default('offered'),
  decidedAt: timestamp({ withTimezone: true }),
  /** The lead or staff user who approved the swap (`approval: 'lead'`). */
  approvedBy: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_swap_offer_swap_idx').on(t.swapId),
  index('shift_swap_offer_user_idx').on(t.userId),
])

/** A reminder claimed (and sent) for an assignment at one offset: the unique key keeps it to one per offset. */
export const shiftReminders = pgTable('shift_reminders', {
  /** `srm_` + random id. */
  id: text().primaryKey(),
  assignmentId: text().notNull(),
  /** How many minutes before the shift starts this reminder was for. */
  offsetMinutes: integer().notNull(),
  userId: integer().notNull(),
  /** When it was claimed: a row stays when sending failed, so a broken address is not retried every run. */
  sentAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  uniqueIndex('shift_reminder_unique').on(t.assignmentId, t.offsetMinutes),
])

/** The secret of a person's calendar feed (iCal): only its hash is stored, the URL carrying it is shown once. */
export const shiftFeedTokens = pgTable('shift_feed_tokens', {
  /** `sft_` + random id. */
  id: text().primaryKey(),
  userId: integer().notNull(),
  tokenHash: text().notNull(),
  /** The first characters of the token, to recognise it. */
  prefix: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  lastUsedAt: timestamp({ withTimezone: true }),
  revokedAt: timestamp({ withTimezone: true }),
}, t => [
  uniqueIndex('shift_feed_token_hash_unique').on(t.tokenHash),
  index('shift_feed_token_user_idx').on(t.userId),
])

/** A message to the people of an operation's teams or one shift, by email and optionally SMS. */
export const shiftBroadcasts = pgTable('shift_broadcasts', {
  /** `shb_` + random id. */
  id: text().primaryKey(),
  operationId: text().notNull(),
  teamId: text(),
  shiftId: text(),
  /** The lowest team role that got it (on each team kind's ladder); `null` is every member. */
  teamRole: text(),
  /** `['email']`, `['sms']` or both. */
  channels: jsonb().$type<string[]>().notNull(),
  subject: jsonb().$type<Translated>().notNull(),
  message: jsonb().$type<Translated>().notNull(),
  recipientCount: integer().notNull(),
  sentBy: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('shift_broadcast_operation_idx').on(t.operationId, t.createdAt),
])

/** A perk of an operation (a meal, a drink voucher): per assignment (`perShift`) or per person over the operation (`perPerson`). */
export const shiftPerks = pgTable('shift_perks', {
  /** `spk_` + random id. */
  id: text().primaryKey(),
  operationId: text().notNull(),
  /** The team it is for; `null` is every team of the operation. */
  teamId: text(),
  /** `meal`, `drink` or `other`. */
  kind: text().notNull().default('meal'),
  name: jsonb().$type<Translated>().notNull(),
  /** The allowance of each assignment. Exactly one of `perShift` and `perPerson` is set. */
  perShift: integer(),
  /** The budget of each person across the operation. */
  perPerson: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('shift_perk_operation_idx').on(t.operationId),
])

/** One redemption of a perk, with the assignment whose pass was scanned and the lead who scanned it. */
export const shiftPerkRedemptions = pgTable('shift_perk_redemptions', {
  /** `spr_` + random id. */
  id: text().primaryKey(),
  perkId: text().notNull(),
  assignmentId: text().notNull(),
  userId: integer().notNull(),
  redeemedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  redeemedBy: integer().notNull(),
}, t => [
  index('shift_perk_redemption_assignment_idx').on(t.perkId, t.assignmentId),
  index('shift_perk_redemption_user_idx').on(t.perkId, t.userId),
])
