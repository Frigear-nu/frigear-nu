import { defineStripeEventHandler } from '@frigear-nu/stripe/utils'
import type Stripe from 'stripe'
import type { InvoicePaymentEvent } from '../../../types'

type InvoiceEventType
  = | 'invoice.paid'
    | 'invoice.payment_failed'
    | 'invoice.voided'
    | 'invoice.marked_uncollectible'

const statusFor: Record<InvoiceEventType, InvoicePaymentEvent['status']> = {
  'invoice.paid': 'paid',
  'invoice.payment_failed': 'failed',
  'invoice.marked_uncollectible': 'failed',
  'invoice.voided': 'expired',
}

const idOf = (value: string | { id: string } | null | undefined) => (typeof value === 'string' ? value : value?.id ?? null)

// Only registered when `@frigear-nu/payments` is installed (see module.ts). Announces membership invoices through the
// `subscriptions:invoice` hook so payments can store them; this module never writes payments itself.
export default defineStripeEventHandler<InvoiceEventType>(async (event, ctx) => {
  const invoice = event.data.object
  if (ctx.userId === null || !invoice.id) return

  const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription)
  if (!subscriptionId) return // Not a membership invoice.
  if (invoice.total === 0 && invoice.amount_paid === 0) return // Free trial / fully discounted: nothing was charged.

  const status = statusFor[event.type]
  const paymentIntentId = await findPaymentIntent(invoice)
  const line = invoice.lines?.data?.[0]

  const payload: InvoicePaymentEvent = {
    userId: ctx.userId,
    invoiceId: invoice.id,
    status,
    amount: status === 'paid' ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency,
    description: line?.description ?? 'Membership',
    referenceType: 'subscription',
    referenceId: subscriptionId,
    paymentIntentId,
    paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
    createdAt: new Date(invoice.created * 1000),
  }
  await useNitroApp().hooks.callHook('subscriptions:invoice', { invoice: payload })
})

// Invoice events carry no payment intent; look it up so a later refund (matched by payment intent) finds the payment.
async function findPaymentIntent(invoice: Stripe.Invoice): Promise<string | null> {
  if (invoice.status !== 'paid') return null
  try {
    const { data } = await useStripe().invoicePayments.list({ invoice: invoice.id!, limit: 1 })
    return idOf(data[0]?.payment?.payment_intent)
  }
  catch (error) {
    console.warn(`[@frigear-nu/subscriptions] Could not resolve the payment intent of invoice ${invoice.id}:`, error)
    return null
  }
}
