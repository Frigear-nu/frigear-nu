import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Foo } from './types'

export const things = sqliteTable('things', {
  id: text().primaryKey(),
  foo: text().$type<Foo>(),
})
