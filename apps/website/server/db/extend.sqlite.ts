import { text } from 'drizzle-orm/sqlite-core'
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

// `stripeCustomerId` is owned by `@frigear-nu/stripe`, `preferences` by `@frigear-nu/preferences`.
export const users = defineTableColumns({
  locale: text().default('da'),
})
