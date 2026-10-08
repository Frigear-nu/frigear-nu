import Stripe from 'stripe'
import { fetch } from '@nuxt/test-utils/e2e'

export const WEBHOOK_SECRET = 'whsec_test_secret'

// NuxtHub KV persists on disk between runs (outside the fixture dir in build mode), so event ids carry
// a per-run suffix to keep repeated runs from being treated as duplicates.
const RUN_ID = Date.now().toString(36)
export const eventId = (name: string) => `evt_${name}_${RUN_ID}`

export type TestEvent = { id: string, type: string, data: { object: Record<string, unknown> } }

export function makeEvent(id: string, type: string, object: Record<string, unknown> = {}): TestEvent {
  return { id, type, data: { object: { object: 'test', ...object } } }
}

export function sign(payload: string, secret = WEBHOOK_SECRET) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret })
}

export async function postWebhook(event: TestEvent, options: { path?: string, signature?: string | null, payload?: string } = {}) {
  const payload = options.payload ?? JSON.stringify(event)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const signature = options.signature === undefined ? sign(payload) : options.signature
  if (signature) headers['stripe-signature'] = signature

  return fetch(options.path ?? '/api/stripe/webhook', { method: 'POST', headers, body: payload })
}

export async function getCalls(): Promise<Array<{ handler: string, type: string, id: string, userId: number | null }>> {
  const response = await fetch('/api/test/calls')
  return response.json()
}

export const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

export type FakeCall = { method: string, path: string, params: Record<string, string> }

export async function getStripeCalls(reset = false): Promise<FakeCall[]> {
  const response = await fetch(`/api/test/stripe-calls${reset ? '?reset=1' : ''}`)
  return response.json()
}

/** A minimal `customer.subscription.*` object as Stripe sends it (period fields live on items). */
export function subscriptionObject(options: {
  id: string
  customer: string
  priceId: string
  lookupKey?: string | null
  status?: string
  cancelAtPeriodEnd?: boolean
  start?: number
  end?: number
  endedAt?: number | null
}) {
  return {
    object: 'subscription',
    id: options.id,
    customer: options.customer,
    status: options.status ?? 'active',
    cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
    ended_at: options.endedAt ?? null,
    canceled_at: null,
    items: {
      object: 'list',
      data: [{
        id: `si_${options.id}`,
        quantity: 1,
        current_period_start: options.start ?? 1700000000,
        current_period_end: options.end ?? 1702592000,
        price: { id: options.priceId, lookup_key: options.lookupKey ?? null },
      }],
    },
  }
}
