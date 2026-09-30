// server/db/users.extend.sqlite.ts
import { text } from 'drizzle-orm/sqlite-core'
import { defineExtendedColumns } from '@frigear-nu/module-kit/utils'

// This extends the user module's user fields..
export default defineExtendedColumns('users', {
  locale: text().default('da'),
  stripeCustomerId: text(),
})
