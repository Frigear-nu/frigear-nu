import { pgTable, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// Who may see a record, see `Visibility` of `@frigear-nu/audience`.
type Visibility = import('@frigear-nu/audience').Visibility
// A button under an answer, see `FaqLink` in types.ts.
type FaqLink = { label: string, to: string, icon?: string }

export const faqGroups = pgTable('faq_groups', {
  /** `faq_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  title: jsonb().$type<Translated>().notNull(),
  description: jsonb().$type<Translated>(),
  icon: text(),
  /** `operation | team | user | platform`, or a type another module adds (see `@frigear-nu/audience`). */
  ownerType: text().notNull().default('platform'),
  /** `null` for the platform. */
  ownerId: text(),
  /** `null` is signed-in viewers only; `{ public: true }` is everyone. */
  visibility: jsonb().$type<Visibility>(),
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
  /** Can only narrow the group's. `null` inherits it. */
  visibility: jsonb().$type<Visibility>(),
  sort: integer().notNull().default(0),
  /** The id of the user who changed it last, as text. */
  updatedBy: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('faq_item_group_sort_idx').on(t.groupId, t.sort),
])
