import { pgTable, text, integer, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// One role of a ladder, see `TeamLadderRole` in types.ts.
type TeamLadderRole = { key: string, label: Translated }
// What a mapping rule matches, see `TeamRoleMatch` in types.ts.
type TeamRoleMatch = { role: string } | { plan: string }

// User ids are plain integers with no foreign key: the users table belongs to another module (as in events and
// authorization). Whoever deletes a user removes their memberships.

export const teams = pgTable('teams', {
  /** `tem_` + random id. */
  id: text().primaryKey(),
  /** `operation`, `platform`, ... (`OwnerType` of this module). Never null. */
  ownerType: text().notNull(),
  /** The owner's id as text; `null` for the platform. */
  ownerId: text(),
  /** A team this one belongs under (same owner). No foreign key: deleting a parent clears it in code. */
  parentId: text(),
  /** The team kind, whose ladder holds the members' roles (`default`, or a kind the app defines). */
  kind: text().notNull(),
  name: jsonb().$type<Translated>().notNull(),
  description: jsonb().$type<Translated>(),
  /** How many people the team needs; informational. */
  capacity: integer(),
  /** Lower first within an owner. */
  sort: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('team_owner_idx').on(t.ownerType, t.ownerId),
])

/** Explicit memberships. Mapped memberships come from `team_role_mappings` at read time and are never stored. */
export const teamMembers = pgTable('team_members', {
  /** `tmm_` + random id. */
  id: text().primaryKey(),
  teamId: text().notNull().references(() => teams.id, { onDelete: 'cascade' }),
  userId: integer().notNull(),
  /** A role key of the team kind's ladder. */
  role: text().notNull(),
  /** Owned by consumers such as crew (`applied`, `approved`, ...); teams never interprets it. */
  status: text(),
  /** The user who added the membership, when it was added by someone. */
  addedBy: integer(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('team_member_unique').on(t.teamId, t.userId),
  index('team_member_user_idx').on(t.userId),
])

/** The role ladder of each team kind, lowest first. Seeded from the module option `ladders`; admins may edit it. */
export const teamRoleLadders = pgTable('team_role_ladders', {
  kind: text().primaryKey(),
  roles: jsonb().$type<TeamLadderRole[]>().notNull(),
  /** The lowest role that leads a team of this kind (`teams:lead`); `null`: nobody leads. */
  leadFrom: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
})

/** Role mapping rules: users who meet `match` hold `teamRole` on the owner's teams (or one team), resolved at read time. */
export const teamRoleMappings = pgTable('team_role_mappings', {
  /** `trm_` + random id. */
  id: text().primaryKey(),
  ownerType: text().notNull(),
  ownerId: text(),
  /** `null`: every team of the owner. */
  teamId: text().references(() => teams.id, { onDelete: 'cascade' }),
  match: jsonb().$type<TeamRoleMatch>().notNull(),
  teamRole: text().notNull(),
  /** Between rules that both match a user on one team, the higher priority wins (then the higher role). */
  priority: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('team_mapping_owner_idx').on(t.ownerType, t.ownerId),
])
