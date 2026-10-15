import { pgTable, text } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  stripeCustomerId: text('stripe_customer_id'),
})
