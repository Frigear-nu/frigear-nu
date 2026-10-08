import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { defineStripeEventHandler } from '@frigear-nu/stripe/utils'
import type { PaymentStatus } from '../../../types'
import { toPaymentDto } from '../utils/payments'

type PaymentEventType
  = | 'checkout.session.completed'
    | 'checkout.session.async_payment_succeeded'
    | 'checkout.session.async_payment_failed'
    | 'checkout.session.expired'
    | 'charge.refunded'

const hookFor = {
  paid: 'payments:paid',
  failed: 'payments:failed',
  expired: 'payments:expired',
  refunded: 'payments:refunded',
} as const

// Stripe events (verified + deduplicated by @frigear-nu/stripe) are the only thing that changes a
// payment. Every branch is a conditional, idempotent update: a redelivered event finds the row in
// the target state already and emits nothing. The Nitro hooks tell other modules about transitions.
export default defineStripeEventHandler<PaymentEventType>(async (event) => {
  const nitro = useNitroApp()

  async function transition(
    where: ReturnType<typeof eq>,
    next: PaymentStatus,
    extra: Partial<typeof schema.payments.$inferInsert>,
    allowedFrom: PaymentStatus[],
    hook: keyof typeof hookFor,
  ) {
    const [row] = await db.select().from(schema.payments).where(where).limit(1)
    if (!row) return // Not one of ours (e.g. a subscription checkout).
    if (row.status === next && hook !== 'refunded') return
    if (!allowedFrom.includes(row.status as PaymentStatus)) return

    const [updated] = await db.update(schema.payments)
      .set({ status: next, ...extra })
      .where(eq(schema.payments.id, row.id))
      .returning()
    if (updated) await nitro.hooks.callHook(hookFor[hook], { payment: toPaymentDto(updated) })
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object
      if (session.payment_status !== 'paid') return // async method: wait for async_payment_succeeded
      await transition(
        eq(schema.payments.checkoutSessionId, session.id),
        'paid',
        { paidAt: new Date(), paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null },
        ['pending', 'failed', 'expired'],
        'paid',
      )
      return
    }
    case 'checkout.session.async_payment_failed': {
      await transition(eq(schema.payments.checkoutSessionId, event.data.object.id), 'failed', {}, ['pending'], 'failed')
      return
    }
    case 'checkout.session.expired': {
      await transition(eq(schema.payments.checkoutSessionId, event.data.object.id), 'expired', {}, ['pending'], 'expired')
      return
    }
    case 'charge.refunded': {
      const charge = event.data.object
      const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
      if (!intent) return
      const full = charge.amount_refunded >= charge.amount
      const [row] = await db.select().from(schema.payments).where(eq(schema.payments.paymentIntentId, intent)).limit(1)
      if (!row || row.refundedAmount === charge.amount_refunded) return
      await transition(
        eq(schema.payments.paymentIntentId, intent),
        full ? 'refunded' : 'partially_refunded',
        { refundedAmount: charge.amount_refunded },
        ['paid', 'partially_refunded'],
        'refunded',
      )
    }
  }
})
