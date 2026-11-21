import { text } from 'drizzle-orm/pg-core'
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

// The postgresql twin of `extend.sqlite.ts`: the same column.
export const users = defineTableColumns({
  phone: text(),
})
