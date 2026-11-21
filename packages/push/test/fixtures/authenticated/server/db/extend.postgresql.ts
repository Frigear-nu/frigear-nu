import { text } from 'drizzle-orm/pg-core'
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

// A host that has phone numbers: `notifyUser` reads this optional column for SMS.
export const users = defineTableColumns({
  phone: text(),
})
