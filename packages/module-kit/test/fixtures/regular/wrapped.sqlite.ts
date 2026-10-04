import { text } from 'drizzle-orm/sqlite-core'
import { defineExtendedColumns } from '../../../src/runtime/utils/server'

export const accounts = defineExtendedColumns({
  summary: text(),
})
