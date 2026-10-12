import { sqliteTable, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  acceptedTermsAt: integer('accepted_terms_at'),
})
