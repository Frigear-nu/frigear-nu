import { text } from 'drizzle-orm/sqlite-core'
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

// Stands in for the column the account module adds to `users` in the real app.
export const users = defineTableColumns({
  colorMode: text(),
})
