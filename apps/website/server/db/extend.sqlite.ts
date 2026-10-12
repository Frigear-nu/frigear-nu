import { text } from 'drizzle-orm/sqlite-core'
import { defineTableColumns } from '@frigear-nu/module-kit/utils'

// `stripeCustomerId` is owned by `@frigear-nu/stripe`.
export const users = defineTableColumns({
  locale: text().default('da'),
  // 'light' | 'dark' | 'system'; null until the user picks one. Forwarded to OAuth applications as `color_mode`.
  colorMode: text(),
})
