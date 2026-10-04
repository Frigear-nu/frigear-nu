import { text } from 'drizzle-orm/sqlite-core'
import { defineTableColumns } from '../../../src/runtime/utils/server'

export const accounts = defineTableColumns({
  summary: text(),
})
