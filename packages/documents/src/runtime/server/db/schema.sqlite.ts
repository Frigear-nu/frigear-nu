import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import type { DocumentAudience, DocumentKind, Translated } from '../../../types'

export const documents = sqliteTable('documents', {
  /** `doc_` + random id. */
  id: text().primaryKey(),
  /** The containing folder; `null` for the root. */
  parentId: text(),
  kind: text().$type<DocumentKind>().notNull(),
  title: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** Iconify class, e.g. `i-lucide-file-text`. */
  icon: text(),
  sortOrder: integer().notNull().default(0),
  /** Nothing is visible to anyone until it is shared. */
  audience: text().$type<DocumentAudience>().notNull().default('groups'),
  /** Files only: pathname in the blob store. */
  pathname: text(),
  filename: text(),
  contentType: text(),
  size: integer(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('documents_parent_idx').on(t.parentId),
])

export const documentShares = sqliteTable('document_shares', {
  documentId: text().notNull().references(() => documents.id, { onDelete: 'cascade' }),
  /** Id of a `@frigear-nu/groups` group (cleaned up through the `groups:deleted` hook). */
  groupId: text().notNull(),
}, t => [
  primaryKey({ columns: [t.documentId, t.groupId] }),
  index('document_shares_group_idx').on(t.groupId),
])
