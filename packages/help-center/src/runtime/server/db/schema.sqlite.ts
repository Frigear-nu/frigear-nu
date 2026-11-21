import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// Who may see a record, see `Visibility` of `@frigear-nu/audience`.
type Visibility = import('@frigear-nu/audience').Visibility

export const helpCategories = sqliteTable('help_categories', {
  /** `hlc_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** The id of the parent category, or `null` for a top-level one. Not a foreign key: deleting a category moves its children up. */
  parentId: text(),
  /** `operation | team | user | platform`, or a type another module adds (see `@frigear-nu/audience`). */
  ownerType: text().notNull().default('platform'),
  /** `null` for the platform. */
  ownerId: text(),
  /** `null` is signed-in viewers only; `{ public: true }` is everyone. Applies to every article in the category. */
  visibility: text({ mode: 'json' }).$type<Visibility>(),
  /** Slugs of `@frigear-nu/faq` groups shown in the category (when faq is installed). */
  faqGroups: text({ mode: 'json' }).$type<string[]>(),
  sort: integer().notNull().default(0),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('help_category_owner_idx').on(t.ownerType, t.ownerId),
  index('help_category_parent_idx').on(t.parentId),
])

export const helpArticles = sqliteTable('help_articles', {
  /** `hlp_` + random id. */
  id: text().primaryKey(),
  categoryId: text().notNull().references(() => helpCategories.id, { onDelete: 'restrict' }),
  slug: text().notNull().unique(),
  title: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** Markdown or MDC, per locale. */
  body: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** `draft | published`. */
  status: text().notNull().default('draft'),
  /** Can only narrow the category's. `null` inherits it. */
  visibility: text({ mode: 'json' }).$type<Visibility>(),
  sort: integer().notNull().default(0),
  publishedAt: integer({ mode: 'timestamp' }),
  /** The id of the user who changed it last, as text. */
  updatedBy: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('help_article_category_status_idx').on(t.categoryId, t.status),
])

export const helpChecklists = sqliteTable('help_checklists', {
  /** `hck_` + random id. */
  id: text().primaryKey(),
  /** The operation the checklist is for, or `null` for every volunteer. */
  operationId: text(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** `null` is signed-in viewers only. */
  visibility: text({ mode: 'json' }).$type<Visibility>(),
  sort: integer().notNull().default(0),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('help_checklist_operation_idx').on(t.operationId),
])

export const helpChecklistItems = sqliteTable('help_checklist_items', {
  /** `hci_` + random id. */
  id: text().primaryKey(),
  checklistId: text().notNull().references(() => helpChecklists.id, { onDelete: 'cascade' }),
  /** A `help_articles` id, or `content:<collection>:<path>` for an article of Nuxt Content. */
  articleId: text().notNull(),
  sort: integer().notNull().default(0),
  required: integer({ mode: 'boolean' }).notNull().default(true),
}, t => [
  uniqueIndex('help_checklist_item_article_idx').on(t.checklistId, t.articleId),
  index('help_checklist_item_sort_idx').on(t.checklistId, t.sort),
])

export const helpReads = sqliteTable('help_reads', {
  /** `hlr_` + random id. */
  id: text().primaryKey(),
  /** The id of the user, as text. */
  userId: text().notNull(),
  /** A `help_articles` id, or `content:<collection>:<path>`. */
  articleId: text().notNull(),
  readAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  uniqueIndex('help_read_user_article_idx').on(t.userId, t.articleId),
  index('help_read_article_idx').on(t.articleId),
])
