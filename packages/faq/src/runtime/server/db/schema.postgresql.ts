import { pgTable, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// Who may read a record, see `Grant` of `@frigear-nu/grants`.
type Grant = { kind: string } & Record<string, unknown>
// A button under an answer, see `FaqLink` in types.ts.
type FaqLink = { label: string, to: string, icon?: string }

export const faqGroups = pgTable('faq_groups', {
  /** `faq_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  title: jsonb().$type<Translated>().notNull(),
  description: jsonb().$type<Translated>(),
  icon: text(),
  /** `platform`, `operation`, `team`, or a type an app adds (`OwnerType` of `@frigear-nu/teams`). */
  ownerType: text().notNull().default('platform'),
  /** `null` for the platform. */
  ownerId: text(),
  /** Who may read it (`@frigear-nu/grants`): any one grant admits, an empty list admits nobody. */
  grants: jsonb().$type<Grant[]>().notNull().default([]),
  sort: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('faq_group_owner_idx').on(t.ownerType, t.ownerId),
])

export const faqItems = pgTable('faq_items', {
  /** `fqi_` + random id. */
  id: text().primaryKey(),
  groupId: text().notNull().references(() => faqGroups.id, { onDelete: 'cascade' }),
  question: jsonb().$type<Translated>().notNull(),
  /** Markdown or MDC, per locale. */
  answer: jsonb().$type<Translated>().notNull(),
  icon: text(),
  links: jsonb().$type<FaqLink[]>(),
  /** `draft | published`. */
  status: text().notNull().default('draft'),
  /** Narrows the parent: `null` inherits it, a list must admit too (`@frigear-nu/grants`). */
  grants: jsonb().$type<Grant[]>(),
  sort: integer().notNull().default(0),
  /** The id of the user who changed it last, as text. */
  updatedBy: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('faq_item_group_sort_idx').on(t.groupId, t.sort),
])
