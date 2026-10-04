import { defineExtendableTable } from '../../../../../src/runtime/utils'
import { text } from 'drizzle-orm/sqlite-core'

export const createUsersTable = defineExtendableTable(({ columns }) => {
  return {
    id: text().primaryKey().unique().$defaultFn(() => crypto.randomUUID()),
    name: text().notNull(),
    ...columns,
  }
})
