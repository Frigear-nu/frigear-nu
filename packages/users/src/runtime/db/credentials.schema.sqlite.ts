// modules/users/db/credentials.sqlite.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { SQLiteColumnBuilderBase } from 'drizzle-orm/sqlite-core'

export function defineUserCredentialsTable<T extends Record<string, SQLiteColumnBuilderBase>>(extra?: T) {
  return sqliteTable('user_credentials', {
    id: text().primaryKey(),
    userId: integer().notNull(),
    publicKey: text().notNull(),
    counter: integer().notNull().default(0),
    backedUp: integer({ mode: 'boolean' }).notNull().default(false),
    transports: text({ mode: 'json' }).$type<string[]>(),
    ...(extra ?? ({} as T)),
    createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  })
}
