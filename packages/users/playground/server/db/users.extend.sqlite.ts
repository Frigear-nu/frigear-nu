// server/db/users.extend.sqlite.ts
import { text } from 'drizzle-orm/sqlite-core'

export default {
  locale: text().default('da'),
  stripeCustomerId: text(),
}
