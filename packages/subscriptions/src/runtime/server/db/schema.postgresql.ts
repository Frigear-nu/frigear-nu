import { pgTable, text, integer, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

// One row per Stripe subscription (or manual grant, see `source`). Rows are never deleted: ended subscriptions get `endedAt`.
// There is deliberately no foreign key to `users` (that table is registered from another file);
// the webhook resolves the user by `stripeCustomerId`.
export const subscriptions = pgTable('subscriptions', {
  /** The Stripe subscription id (`sub_...`). */
  id: text().primaryKey(),
  userId: integer().notNull(),
  /** Configured plan key, or null when the price isn't part of any configured plan. */
  planKey: text(),
  priceId: text().notNull(),
  /** The raw Stripe status (`active`, `trialing`, `past_due`, `canceled`, ...). */
  status: text().notNull(),
  cancelAtPeriodEnd: boolean().notNull().default(false),
  currentPeriodStart: timestamp({ withTimezone: true }),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  endedAt: timestamp({ withTimezone: true }),
  /** `stripe` for webhook-synced rows, `manual` for free grants made by staff (no Stripe subscription behind it). */
  source: text().notNull().default('stripe'),
  rawItems: jsonb().$type<Array<{ id: string, priceId: string, lookupKey: string | null, quantity: number | null }>>(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('subscription_user_idx').on(t.userId),
])
