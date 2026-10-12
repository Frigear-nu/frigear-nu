import { db, schema } from '@nuxthub/db'
import { and, desc, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { CreatePaymentInput, CreatePaymentResult, PaymentDto, PaymentStatus } from '../../../types'
import { resolveSameOriginUrl, sumItems } from '../../utils'

type PaymentRow = typeof schema.payments.$inferSelect

export function toPaymentDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status as PaymentStatus,
    amount: row.amount,
    currency: row.currency,
    description: row.description,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    refundedAmount: row.refundedAmount,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

const newPaymentId = () => `pay_${crypto.randomUUID().replaceAll('-', '')}`

function safeReturnUrl(input: string, event: H3Event | undefined, name: string): string {
  if (!event) return input
  const resolved = resolveSameOriginUrl(input, getRequestURL(event).origin)
  if (!resolved) throw createError({ statusCode: 400, statusMessage: `${name} must be a relative path or an URL on the same origin.` })
  return resolved
}

function expiresAt(minutes: number): number {
  // Stripe only accepts 30 minutes - 24 hours.
  const clamped = Math.min(Math.max(Math.round(minutes), 30), 1440)
  return Math.floor(Date.now() / 1000) + clamped * 60
}

/**
 * Creates a Stripe Checkout session (`mode: 'payment'`, inline `price_data`) and a `pending` payment
 * row. The row only turns `paid` when Stripe tells us so (see `payments:paid`).
 *
 * Pass the request `event` to have the return URLs restricted to the current origin.
 */
export async function createPayment(input: CreatePaymentInput, event?: H3Event): Promise<CreatePaymentResult> {
  if (input.items.length === 0) throw createError({ statusCode: 400, statusMessage: 'A payment needs at least one item.' })
  const currency = input.items[0]!.currency.toLowerCase()
  if (input.items.some(item => item.currency.toLowerCase() !== currency)) {
    throw createError({ statusCode: 400, statusMessage: 'All items in a payment must share one currency.' })
  }
  const amount = sumItems(input.items)
  if (amount <= 0) throw createError({ statusCode: 400, statusMessage: 'The payment amount must be greater than zero.' })

  const config = useRuntimeConfig().payments
  const stripe = useStripe()
  const customer = await ensureStripeCustomer(input.userId)
  const id = newPaymentId()
  const metadata = { ...input.metadata, paymentId: id, userId: String(input.userId) }

  const context = {
    event,
    userId: input.userId,
    reference: input.reference,
    params: {
      mode: 'payment',
      customer,
      client_reference_id: String(input.userId),
      line_items: input.items.map(item => ({
        quantity: item.quantity ?? 1,
        price_data: {
          currency,
          unit_amount: item.amount,
          product_data: { name: item.name, ...(item.description ? { description: item.description } : {}) },
        },
      })),
      success_url: safeReturnUrl(input.successUrl, event, 'successUrl'),
      cancel_url: safeReturnUrl(input.cancelUrl, event, 'cancelUrl'),
      expires_at: expiresAt(input.expiresInMinutes ?? config.checkoutExpiresInMinutes),
      metadata,
      payment_intent_data: { metadata },
    },
  } satisfies import('../../../types').CheckoutBeforeContext
  await useNitroApp().hooks.callHook('payments:checkout:before', context)

  const session = await stripe.checkout.sessions.create(context.params)
  if (!session.url) throw createError({ statusCode: 502, statusMessage: 'Stripe did not return a checkout URL.' })

  try {
    const [row] = await db.insert(schema.payments).values({
      id,
      userId: input.userId,
      amount,
      currency,
      description: input.description ?? null,
      referenceType: input.reference?.type ?? null,
      referenceId: input.reference?.id ?? null,
      checkoutSessionId: session.id,
      metadata: input.metadata ?? null,
    }).returning()
    return { payment: toPaymentDto(row!), url: session.url }
  }
  catch (error) {
    // Do not leave an open session behind that we have no record of.
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
    throw error
  }
}

export async function getPayment(id: string): Promise<PaymentDto | null> {
  const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, id)).limit(1)
  return row ? toPaymentDto(row) : null
}

export async function getPaymentByReference(type: string, id: string): Promise<PaymentDto | null> {
  const [row] = await db.select().from(schema.payments)
    .where(and(eq(schema.payments.referenceType, type), eq(schema.payments.referenceId, id)))
    .orderBy(desc(schema.payments.createdAt))
    .limit(1)
  return row ? toPaymentDto(row) : null
}

/** A user's payments, newest first; `limit` caps how many are returned. */
export async function listUserPayments(userId: number, options: { limit?: number } = {}): Promise<PaymentDto[]> {
  const query = db.select().from(schema.payments)
    .where(eq(schema.payments.userId, userId))
    .orderBy(desc(schema.payments.createdAt))
  const rows = await (options.limit ? query.limit(options.limit) : query)
  return rows.map(toPaymentDto)
}

/**
 * Returns a checkout URL for a still-unpaid payment: the original session when it is open, otherwise
 * a fresh session for the same amount (the payment row follows the new session). Throws for payments
 * that are already paid/refunded.
 */
export async function resumePayment(paymentId: string, userId: number, event?: H3Event): Promise<{ url: string }> {
  const [row] = await db.select().from(schema.payments)
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId)))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Payment not found.' })
  if (row.status === 'paid' || row.status === 'refunded' || row.status === 'partially_refunded') {
    throw createError({ statusCode: 409, statusMessage: 'This payment is already paid.' })
  }

  const stripe = useStripe()
  const session = await stripe.checkout.sessions.retrieve(row.checkoutSessionId)
  if (session.status === 'open' && session.url) return { url: session.url }
  if (session.status === 'complete') throw createError({ statusCode: 409, statusMessage: 'This payment is already paid.' })

  const customer = await ensureStripeCustomer(userId)
  const metadata = { ...row.metadata, paymentId: row.id, userId: String(userId) }
  const origin = event ? getRequestURL(event).origin : undefined
  const successUrl = session.success_url ?? origin
  const cancelUrl = session.cancel_url ?? origin
  if (!successUrl || !cancelUrl) throw createError({ statusCode: 409, statusMessage: 'Cannot resume this payment.' })

  const next = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer,
    client_reference_id: String(userId),
    line_items: [{
      quantity: 1,
      price_data: {
        currency: row.currency,
        unit_amount: row.amount,
        product_data: { name: row.description ?? 'Payment' },
      },
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: expiresAt(useRuntimeConfig().payments.checkoutExpiresInMinutes),
    metadata,
    payment_intent_data: { metadata },
  })
  if (!next.url) throw createError({ statusCode: 502, statusMessage: 'Stripe did not return a checkout URL.' })

  await db.update(schema.payments)
    .set({ checkoutSessionId: next.id, status: 'pending' })
    .where(eq(schema.payments.id, row.id))
  return { url: next.url }
}

/**
 * Refunds a paid payment (fully, or `amount` minor units). The status change is applied by the
 * `charge.refunded` Stripe event, so the `payments:refunded` hook fires once from one place.
 */
export async function refundPayment(paymentId: string, options: { amount?: number } = {}): Promise<void> {
  const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Payment not found.' })
  if (!row.paymentIntentId || (row.status !== 'paid' && row.status !== 'partially_refunded')) {
    throw createError({ statusCode: 409, statusMessage: 'Only paid payments can be refunded.' })
  }
  if (options.amount !== undefined && (options.amount <= 0 || options.amount > row.amount - row.refundedAmount)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid refund amount.' })
  }

  await useStripe().refunds.create({
    payment_intent: row.paymentIntentId,
    ...(options.amount !== undefined ? { amount: options.amount } : {}),
  })
}
