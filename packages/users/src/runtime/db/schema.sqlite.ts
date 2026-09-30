// modules/users/db/users.sqlite.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'

export function defineUsersTable<T extends Record<string, SQLiteColumnBuilderBase>>(extra?: T) {
  return sqliteTable('users', {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    email: text().notNull().unique(),
    password: text(),
    avatar: text(),
    ...(extra ?? ({} as T)), // located here since we want it to appear here...
    createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp' }).notNull().$onUpdateFn(() => new Date()),
  })
}
