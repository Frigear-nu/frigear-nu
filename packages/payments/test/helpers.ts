import Stripe from 'stripe'
import { $fetch, fetch } from '@nuxt/test-utils/e2e'
import { expect } from 'vitest'

export const WEBHOOK_SECRET = 'whsec_test_secret'

// NuxtHub KV persists on disk between runs, so event ids carry a per-run suffix to keep repeated
// runs from being treated as duplicates.
const RUN_ID = Date.now().toString(36)
export const eventId = (name: string) => `evt_${name}_${RUN_ID}`

export type TestEvent = { id: string, type: string, data: { object: Record<string, unknown> } }

export function makeEvent(id: string, type: string, object: Record<string, unknown> = {}): TestEvent {
  return { id, type, data: { object: { object: 'test', ...object } } }
}

export function sign(payload: string, secret = WEBHOOK_SECRET) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret })
}

export async function postWebhook(event: TestEvent) {
  const payload = JSON.stringify(event)
  return fetch('/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload) },
    body: payload,
  })
}

export async function sendEvent(name: string, type: string, object: Record<string, unknown>) {
  const response = await postWebhook(makeEvent(eventId(name), type, object))
  expect(response.status, await response.clone().text()).toBe(200)
}

export async function registerUser(name: string, email: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  const cookie = response.headers.get('set-cookie')!
  const customerId = `cus_${email}`
  const { id } = await $fetch<{ id: number }>('/api/test/link', { method: 'POST', body: { email, customerId } })
  return { cookie, id, customerId }
}

export type FakeCall = { method: string, path: string, params: Record<string, string> }

export async function getStripeCalls(reset = false): Promise<FakeCall[]> {
  const response = await fetch(`/api/test/stripe-calls${reset ? '?reset=1' : ''}`)
  return response.json()
}

export type HookCall = { hook: string, paymentId: string, status: string, refundedAmount: number }

export async function getHookCalls(reset = false): Promise<HookCall[]> {
  const response = await fetch(`/api/test/hooks${reset ? '?reset=1' : ''}`)
  return response.json()
}
