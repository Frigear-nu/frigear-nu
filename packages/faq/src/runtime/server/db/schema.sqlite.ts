import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// Who may read a record, see `Grant` of `@frigear-nu/grants`.
type Grant = { kind: string } & Record<string, unknown>
// A button under an answer, see `FaqLink` in types.ts.
type FaqLink = { label: string, to: string, icon?: string }

export const faqGroups = sqliteTable('faq_groups', {
  /** `faq_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  title: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  icon: text(),
  /** `platform`, `operation`, `team`, or a type an app adds (`OwnerType` of `@frigear-nu/teams`). */
  ownerType: text().notNull().default('platform'),
  /** `null` for the platform. */
  ownerId: text(),
  /** Who may read it (`@frigear-nu/grants`): any one grant admits, an empty list admits nobody. */
  grants: text({ mode: 'json' }).$type<Grant[]>().notNull().default([]),
  sort: integer().notNull().default(0),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('faq_group_owner_idx').on(t.ownerType, t.ownerId),
])

export const faqItems = sqliteTable('faq_items', {
  /** `fqi_` + random id. */
  id: text().primaryKey(),
  groupId: text().notNull().references(() => faqGroups.id, { onDelete: 'cascade' }),
  question: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** Markdown or MDC, per locale. */
  answer: text({ mode: 'json' }).$type<Translated>().notNull(),
  icon: text(),
  links: text({ mode: 'json' }).$type<FaqLink[]>(),
  /** `draft | published`. */
  status: text().notNull().default('draft'),
  /** Narrows the parent: `null` inherits it, a list must admit too (`@frigear-nu/grants`). */
  grants: text({ mode: 'json' }).$type<Grant[]>(),
  sort: integer().notNull().default(0),
  /** The id of the user who changed it last, as text. */
  updatedBy: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('faq_item_group_sort_idx').on(t.groupId, t.sort),
])
