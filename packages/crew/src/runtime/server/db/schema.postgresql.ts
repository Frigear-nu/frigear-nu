import { pgTable, text, integer, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// The emails sent when a crew status changes, per status, see `CrewStatusEmails` in types.ts.
type CrewStatusEmails = Record<string, { enabled?: boolean, subject?: Translated, body?: Translated }>

// Crew memberships are `team_members` rows (crew extends that table, see `team-members.postgresql.ts`). Operation, team
// and user ids carry no foreign key here: those tables belong to other modules, which clean up after themselves.

/** How an operation's crew is recruited. One row per operation, created by the first save of the settings. */
export const crewSettings = pgTable('crew_settings', {
  operationId: text().primaryKey(),
  /** The forms form people apply with (`forms.id`). Applications need it, and it must ask for a signed-in user. */
  formId: text(),
  /** The team applications land in (`teams.id`). Created with the settings when the operation has no team. */
  defaultTeamId: text(),
  /** How many people the operation needs; `null` is unlimited. Once the approved crew reaches it, new applications wait. */
  capacity: integer(),
  /** Applications over the capacity wait on a list instead of staying `applied`. */
  waitlist: boolean().notNull().default(true),
  /** Earlier crew come first when the waiting list is promoted. */
  previousCrewFirst: boolean().notNull().default(false),
  opensAt: timestamp({ withTimezone: true }),
  closesAt: timestamp({ withTimezone: true }),
  /** Per status, whether the email goes out and its own subject and body. */
  statusEmails: jsonb().$type<CrewStatusEmails>(),
  /** Role mapping presets were added for this operation. */
  presets: boolean().notNull().default(true),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})

/** Invite links: a hashed token that adds the person who opens it to a team, approved, with the invite's role. */
export const crewInvites = pgTable('crew_invites', {
  /** `civ_` + random id. */
  id: text().primaryKey(),
  operationId: text().notNull(),
  teamId: text().notNull(),
  /** A role of the team kind's ladder; `ba` for "invite as lead". */
  role: text().notNull(),
  /** SHA-256 (base64url) of the token. The token itself is shown once, on creation. */
  tokenHash: text().notNull(),
  /** First characters of the token, to recognise it in the list. */
  prefix: text().notNull(),
  maxUses: integer().notNull().default(1),
  uses: integer().notNull().default(0),
  expiresAt: timestamp({ withTimezone: true }),
  createdBy: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  revokedAt: timestamp({ withTimezone: true }),
}, t => [
  uniqueIndex('crew_invite_token_unique').on(t.tokenHash),
  index('crew_invite_operation_idx').on(t.operationId),
])
