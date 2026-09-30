import { text } from 'drizzle-orm/sqlite-core'
import { defineExtendedColumns } from '@frigear-nu/module-kit/utils'

export const users = defineExtendedColumns({
  locale: text().default('da'),
  stripeCustomerId: text(),
})
