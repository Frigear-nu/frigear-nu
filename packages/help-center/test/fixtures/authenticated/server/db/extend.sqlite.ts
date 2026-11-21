import { text } from 'drizzle-orm/sqlite-core'
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

// A host that sends texts keeps a phone number on its users: the help center sends SMS to it when the column exists.
export const users = defineTableColumns({
  phone: text(),
})
