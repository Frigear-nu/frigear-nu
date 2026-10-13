import type Stripe from 'stripe'
import type { H3Event } from 'h3'

export type ModuleOptions = {
  settings?: {
    /** Minutes a Checkout session stays open before it expires (Stripe allows 30 - 1440). Defaults to `30`. */
    checkoutExpiresInMinutes?: number
    // Expose this module's MCP tools on the MCP endpoint. Defaults to `false`.
    mcp?: boolean
  }
}

export type PaymentsRuntimeConfig = {
  checkoutExpiresInMinutes: number
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'partially_refunded'

export type PaymentItem = {
  name: string
  description?: string
  /** Unit amount in the currency's minor unit (e.g. cents / øre). */
  amount: number
  /** Three letter ISO currency code. */
  currency: string
  quantity?: number
}

export type PaymentReference = {
  /** What the payment is for, e.g. `event_ticket`. Used by consumers to filter lifecycle hooks. */
  type: string
  id: string
}

export type PaymentDto = {
  id: string
  userId: number
  status: PaymentStatus
  amount: number
  currency: string
  description: string | null
  referenceType: string | null
  referenceId: string | null
  refundedAmount: number
  paidAt: string | null
  createdAt: string
}

export type CreatePaymentInput = {
  userId: number
  items: PaymentItem[]
  reference?: PaymentReference
  /** Absolute URL, or a path on the current origin. */
  successUrl: string
  cancelUrl: string
  description?: string
  expiresInMinutes?: number
  metadata?: Record<string, string>
}

export type CreatePaymentResult = {
  payment: PaymentDto
  url: string
}

/** An invoice to store as a payment, see `recordInvoicePayment`. */
export type InvoicePaymentInput = {
  userId: number
  invoiceId: string
  status: 'paid' | 'failed' | 'expired'
  /** Total in the currency's minor unit. */
  amount: number
  currency: string
  description: string | null
  /** Defaults to `subscription`. */
  referenceType?: string
  /** What the invoice is for, e.g. the Stripe subscription id. */
  referenceId: string | null
  paymentIntentId: string | null
  paidAt: Date | null
  createdAt?: Date
}

export type PaymentHookContext = {
  payment: PaymentDto
}

export type CheckoutBeforeContext = {
  event?: H3Event
  userId: number
  reference?: PaymentReference
  /** Mutable: adjust the Checkout session params before they are sent to Stripe. */
  params: Stripe.Checkout.SessionCreateParams
}

export type ResumeResponse = { url: string }
