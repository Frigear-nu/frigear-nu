import { defineTable } from '../../../../../src/runtime/utils'
import { text } from 'drizzle-orm/sqlite-core'

export const users = defineTable((extras) => {
  return {
    id: text().primaryKey().unique().$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    ...extras,
  }
})
