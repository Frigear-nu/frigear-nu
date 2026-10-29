import { db, schema } from '@nuxthub/db'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { CheckoutBeforeContext, CreatePaymentInput, InvoicePaymentInput, CreatePaymentResult, PaymentDto, PaymentItem, PaymentReference, PaymentStatus } from '../../../types'
import { apiError, badRequest, conflict, notFound, resolveSameOriginUrl } from '@frigear-nu/module-kit/server'
import { sumItems } from '../../utils'

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
  if (!event) {
    // Without a request there is no origin to compare with; still only allow absolute http(s) URLs.
    const absolute = URL.canParse(input) && ['http:', 'https:'].includes(new URL(input).protocol)
    if (!absolute) throw badRequest(`${name} must be an absolute http(s) URL.`)
    return input
  }
  return resolveSameOriginUrl(event, input, { name })
}

function toLineItems(items: PaymentItem[], currency: string) {
  return items.map(item => ({
    quantity: item.quantity ?? 1,
    price_data: {
      currency,
      unit_amount: item.amount,
      product_data: { name: item.name, ...(item.description ? { description: item.description } : {}) },
    },
  }))
}

type CheckoutSource = {
  paymentId: string
  userId: number
  customer: string
  currency: string
  items: PaymentItem[]
  reference?: PaymentReference
  successUrl: string
  cancelUrl: string
  expiresInMinutes: number
  metadata?: Record<string, string> | null
  event?: H3Event
}

/** Builds the Checkout session params and lets `payments:checkout:before` adjust them. Shared by create and resume. */
async function buildCheckoutParams(source: CheckoutSource): Promise<CheckoutBeforeContext['params']> {
  const metadata = { ...source.metadata, paymentId: source.paymentId, userId: String(source.userId) }
  const context = {
    event: source.event,
    userId: source.userId,
    reference: source.reference,
    params: {
      mode: 'payment',
      customer: source.customer,
      client_reference_id: String(source.userId),
      line_items: toLineItems(source.items, source.currency),
      success_url: safeReturnUrl(source.successUrl, source.event, 'successUrl'),
      cancel_url: safeReturnUrl(source.cancelUrl, source.event, 'cancelUrl'),
      expires_at: expiresAt(source.expiresInMinutes),
      metadata,
      payment_intent_data: { metadata },
    },
  } satisfies CheckoutBeforeContext
  await useNitroApp().hooks.callHook('payments:checkout:before', context)
  return context.params
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
  if (input.items.length === 0) throw badRequest('A payment needs at least one item.')
  const currency = input.items[0]!.currency.toLowerCase()
  if (input.items.some(item => item.currency.toLowerCase() !== currency)) {
    throw badRequest('All items in a payment must share one currency.')
  }
  const amount = sumItems(input.items)
  if (amount <= 0) throw badRequest('The payment amount must be greater than zero.')

  const config = useRuntimeConfig().payments
  const stripe = useStripe()
  const customer = await ensureStripeCustomer(input.userId)
  const id = newPaymentId()
  const params = await buildCheckoutParams({
    paymentId: id,
    userId: input.userId,
    customer,
    currency,
    items: input.items,
    reference: input.reference,
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    expiresInMinutes: input.expiresInMinutes ?? config.checkoutExpiresInMinutes,
    metadata: input.metadata,
    event,
  })

  const session = await stripe.checkout.sessions.create(params)
  if (!session.url) throw apiError(502, 'bad_gateway', 'Stripe did not return a checkout URL.')

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
      items: input.items,
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
    .orderBy(desc(sql`coalesce(${schema.payments.paidAt}, ${schema.payments.createdAt})`))
  const rows = await (options.limit ? query.limit(options.limit) : query)
  return rows.map(toPaymentDto)
}

/**
 * Returns a checkout URL for a still-unpaid payment: the original session when it is open, otherwise
 * a fresh session built from the stored items (the payment row follows the new session). The
 * `payments:checkout:before` hook and return URL validation run again, as in `createPayment`. Throws for payments
 * that are already paid/refunded.
 */
export async function resumePayment(paymentId: string, userId: number, event?: H3Event): Promise<{ url: string }> {
  const [row] = await db.select().from(schema.payments)
    .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.userId, userId)))
    .limit(1)
  if (!row) throw notFound('Payment not found.')
  if (row.status === 'paid' || row.status === 'refunded' || row.status === 'partially_refunded') {
    throw conflict('This payment is already paid.')
  }

  const stripe = useStripe()
  if (!row.checkoutSessionId) throw conflict('This payment cannot be resumed.')
  const session = await stripe.checkout.sessions.retrieve(row.checkoutSessionId)
  if (session.status === 'open' && session.url) return { url: session.url }
  if (session.status === 'complete') throw conflict('This payment is already paid.')

  const origin = event ? getRequestURL(event).origin : undefined
  const successUrl = session.success_url ?? origin
  const cancelUrl = session.cancel_url ?? origin
  if (!successUrl || !cancelUrl) throw conflict('Cannot resume this payment.')

  // Rows created before `items` was stored only have the total: fall back to one generic line.
  const items: PaymentItem[] = row.items?.length
    ? row.items
    : [{ name: row.description ?? 'Payment', amount: row.amount, currency: row.currency }]
  const customer = await ensureStripeCustomer(userId)
  const params = await buildCheckoutParams({
    paymentId: row.id,
    userId,
    customer,
    currency: row.currency,
    items,
    reference: row.referenceType && row.referenceId ? { type: row.referenceType, id: row.referenceId } : undefined,
    successUrl,
    cancelUrl,
    expiresInMinutes: useRuntimeConfig().payments.checkoutExpiresInMinutes,
    metadata: row.metadata,
    event,
  })
  const next = await stripe.checkout.sessions.create(params)
  if (!next.url) throw apiError(502, 'bad_gateway', 'Stripe did not return a checkout URL.')

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
  if (!row) throw notFound('Payment not found.')
  if (!row.paymentIntentId || (row.status !== 'paid' && row.status !== 'partially_refunded')) {
    throw conflict('Only paid payments can be refunded.')
  }
  if (options.amount !== undefined && (options.amount <= 0 || options.amount > row.amount - row.refundedAmount)) {
    throw badRequest('Invalid refund amount.')
  }

  await useStripe().refunds.create({
    payment_intent: row.paymentIntentId,
    ...(options.amount !== undefined ? { amount: options.amount } : {}),
  })
}

const hookForInvoice = { paid: 'payments:paid', failed: 'payments:failed', expired: 'payments:expired' } as const

/**
 * Stores (or updates) the payment for a Stripe invoice, keyed by the invoice id, so recurring charges such as
 * membership renewals show up next to one-time payments. Idempotent: a redelivered event changes nothing and a
 * late `failed`/`expired` never overwrites a payment that is already paid or refunded. Fires the matching
 * `payments:*` hook only when the status actually changed. Refunds arrive through the `charge.refunded` handler,
 * which finds the row by `paymentIntentId`.
 */
export async function recordInvoicePayment(input: InvoicePaymentInput): Promise<PaymentDto> {
  const nitro = useNitroApp()
  const [existing] = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, input.invoiceId)).limit(1)

  if (existing) {
    const settled = ['paid', 'refunded', 'partially_refunded'].includes(existing.status)
    if (settled || existing.status === input.status) return toPaymentDto(existing)
  }

  const values = {
    userId: input.userId,
    status: input.status,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    referenceType: input.referenceType ?? 'subscription',
    referenceId: input.referenceId,
    invoiceId: input.invoiceId,
    paymentIntentId: input.paymentIntentId,
    paidAt: input.status === 'paid' ? input.paidAt ?? new Date() : null,
  }
  const [row] = existing
    ? await db.update(schema.payments).set(values).where(eq(schema.payments.id, existing.id)).returning()
    : await db.insert(schema.payments)
        .values({ id: newPaymentId(), ...values, ...(input.createdAt ? { createdAt: input.createdAt } : {}) })
        .onConflictDoNothing({ target: schema.payments.invoiceId })
        .returning()
  // Lost a race with a concurrent delivery of the same invoice: that one fires the hook.
  if (!row) {
    const [current] = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, input.invoiceId)).limit(1)
    if (!current) throw apiError(500, 'internal_error', 'Could not record the invoice payment.')
    return toPaymentDto(current)
  }

  const dto = toPaymentDto(row)
  if (input.status in hookForInvoice) await nitro.hooks.callHook(hookForInvoice[input.status as keyof typeof hookForInvoice], { payment: dto })
  return dto
}
