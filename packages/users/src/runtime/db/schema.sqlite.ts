// modules/users/db/users.sqlite.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'
import { defineExtendableTable } from '@frigear-nu/module-kit/utils'

export const defineUsersTable = defineExtendableTable(({ name, columns }) => {
  return sqliteTable(name, {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    email: text().notNull().unique(),
    password: text(),
    avatar: text(),
    createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp' }).notNull().$onUpdateFn(() => new Date()),
    ...(columns as Record<string, SQLiteColumnBuilderBase>), // extended columns always come last, after the table's own fields
  })
})
