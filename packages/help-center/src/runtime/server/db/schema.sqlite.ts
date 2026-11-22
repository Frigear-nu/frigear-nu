import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// Who may read a record, see `Grant` of `@frigear-nu/auth`.
type Grant = { kind: string } & Record<string, unknown>
// A button under an article's text, see `HelpLink` in types.ts.
type HelpLink = { label: string, to: string, icon?: string }

export const helpCategories = sqliteTable('help_categories', {
  /** `hlc_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** The id of the parent category, or `null` for a top-level one. Not a foreign key: deleting a category moves its children up. */
  parentId: text(),
  /** `platform`, `operation`, `team`, or a type an app adds (`OwnerType` of `@frigear-nu/teams`). */
  ownerType: text().notNull().default('platform'),
  /** `null` for the platform. */
  ownerId: text(),
  /** Who may read it (`@frigear-nu/auth`): any one grant admits, an empty list admits nobody. */
  grants: text({ mode: 'json' }).$type<Grant[]>().notNull().default([]),
  /** How the category page shows its articles: `list` (links to article pages) or `accordion` (questions that open in place). */
  display: text().notNull().default('list'),
  /** An icon name such as `i-lucide-info`, shown on cards. */
  icon: text(),
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
  /** `title` in every language and `slug`, folded for search (`searchText` of `@frigear-nu/module-kit/server`). */
  searchText: text().notNull().default(''),
  /** `body` in every language, folded for search. */
  searchBody: text().notNull().default(''),
  /** An icon name such as `i-lucide-info`, shown next to the title in an accordion. */
  icon: text(),
  /** Buttons under the text in an accordion. */
  links: text({ mode: 'json' }).$type<HelpLink[]>(),
  /** `draft | published`. */
  status: text().notNull().default('draft'),
  /** Narrows the parent: `null` inherits it, a list must admit too (`@frigear-nu/auth`). */
  grants: text({ mode: 'json' }).$type<Grant[]>(),
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
  /** Who may read it (`@frigear-nu/auth`): any one grant admits, an empty list admits nobody. */
  grants: text({ mode: 'json' }).$type<Grant[]>().notNull().default([]),
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
