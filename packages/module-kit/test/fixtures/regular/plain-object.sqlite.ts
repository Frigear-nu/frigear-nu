import { text } from 'drizzle-orm/sqlite-core'

export const accounts = {
  locale: text().default('da'),
}
