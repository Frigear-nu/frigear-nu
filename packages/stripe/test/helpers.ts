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
