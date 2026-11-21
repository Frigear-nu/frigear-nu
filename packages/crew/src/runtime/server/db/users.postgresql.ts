import { pgTable, text } from 'drizzle-orm/pg-core'

// The phone number from the crew application (`phoneField`), so shifts and SMS can reach a volunteer. Shown to staff
// with `crew:pii` only.
export const users = pgTable('users', {
  phone: text(),
})
