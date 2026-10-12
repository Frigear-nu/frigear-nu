import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
import type { Translated } from '../../../types'

export const userGroups = sqliteTable('user_groups', {
  /** `grp_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** Iconify class, e.g. `i-lucide-users`. */
  icon: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const userGroupMembers = sqliteTable('user_group_members', {
  groupId: text().notNull().references(() => userGroups.id, { onDelete: 'cascade' }),
  userId: integer().notNull(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  primaryKey({ columns: [t.groupId, t.userId] }),
  index('user_group_members_user_idx').on(t.userId),
])
