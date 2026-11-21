import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// Who may see a record, see `Visibility` of `@frigear-nu/audience`.
type Visibility = import('@frigear-nu/audience').Visibility
// A button under an answer, see `FaqLink` in types.ts.
type FaqLink = { label: string, to: string, icon?: string }

export const faqGroups = sqliteTable('faq_groups', {
  /** `faq_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  title: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  icon: text(),
  /** `operation | team | user | platform`, or a type another module adds (see `@frigear-nu/audience`). */
  ownerType: text().notNull().default('platform'),
  /** `null` for the platform. */
  ownerId: text(),
  /** `null` is signed-in viewers only; `{ public: true }` is everyone. */
  visibility: text({ mode: 'json' }).$type<Visibility>(),
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
  /** Can only narrow the group's. `null` inherits it. */
  visibility: text({ mode: 'json' }).$type<Visibility>(),
  sort: integer().notNull().default(0),
  /** The id of the user who changed it last, as text. */
  updatedBy: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('faq_item_group_sort_idx').on(t.groupId, t.sort),
])
