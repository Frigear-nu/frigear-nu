import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// One row per Checkout session created for a one-time payment. State only changes in response to
// Stripe events (see `server/stripe/payment-events.ts`), never from the browser redirect.
// There is deliberately no foreign key to `users` (that table is registered from another file).
export const payments = sqliteTable('payments', {
  /** `pay_` + random id. */
  id: text().primaryKey(),
  userId: integer().notNull(),
  /** `pending | paid | failed | expired | refunded | partially_refunded`. */
  status: text().notNull().default('pending'),
  /** Total in the currency's minor unit. */
  amount: integer().notNull(),
  currency: text().notNull(),
  description: text(),
  /** What the payment is for (e.g. `event_ticket`) and the id of that thing. */
  referenceType: text(),
  referenceId: text(),
  checkoutSessionId: text().notNull().unique(),
  paymentIntentId: text(),
  refundedAmount: integer().notNull().default(0),
  metadata: text({ mode: 'json' }).$type<Record<string, string>>(),
  paidAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('payment_user_idx').on(t.userId),
  index('payment_reference_idx').on(t.referenceType, t.referenceId),
  index('payment_intent_idx').on(t.paymentIntentId),
])
