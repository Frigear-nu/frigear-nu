import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  stripeCustomerId: text('stripe_customer_id'),
})
