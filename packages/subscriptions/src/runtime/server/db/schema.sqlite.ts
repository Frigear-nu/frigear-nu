import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// One row per Stripe subscription (or manual grant, see `source`). Rows are never deleted: ended subscriptions get `endedAt`.
// There is deliberately no foreign key to `users` (that table is registered from another file);
// the webhook resolves the user by `stripeCustomerId`.
export const subscriptions = sqliteTable('subscriptions', {
  /** The Stripe subscription id (`sub_...`). */
  id: text().primaryKey(),
  userId: integer().notNull(),
  /** Configured plan key, or null when the price isn't part of any configured plan. */
  planKey: text(),
  priceId: text().notNull(),
  /** The raw Stripe status (`active`, `trialing`, `past_due`, `canceled`, ...). */
  status: text().notNull(),
  cancelAtPeriodEnd: integer({ mode: 'boolean' }).notNull().default(false),
  currentPeriodStart: integer({ mode: 'timestamp' }),
  currentPeriodEnd: integer({ mode: 'timestamp' }),
  endedAt: integer({ mode: 'timestamp' }),
  /** `stripe` for webhook-synced rows, `manual` for free grants made by staff (no Stripe subscription behind it). */
  source: text().notNull().default('stripe'),
  rawItems: text({ mode: 'json' }).$type<Array<{ id: string, priceId: string, lookupKey: string | null, quantity: number | null }>>(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('subscription_user_idx').on(t.userId),
])
