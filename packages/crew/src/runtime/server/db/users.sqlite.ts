import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The phone number from the crew application (`phoneField`), so shifts and SMS can reach a volunteer. Shown to staff
// with `crew:pii` only.
export const users = sqliteTable('users', {
  phone: text(),
})
