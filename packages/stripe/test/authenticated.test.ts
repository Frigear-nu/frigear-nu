import { fileURLToPath } from 'node:url'
import { readFile, rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { eventId, getCalls, makeEvent, postWebhook } from './helpers'

describe('stripe webhook (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir,
    // Dev mode lets NuxtHub apply the committed sqlite migrations on startup.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  it('extends the generated users schema with stripeCustomerId', async () => {
    const schema = await readFile(`${rootDir}/.nuxt/hub/db/schema.mjs`, 'utf8')
    expect(schema).toContain('stripe_customer_id')
  })

  it('resolves the user from the Stripe customer id and passes it to handlers', async () => {
    const register = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'supersecret123' }),
    })
    expect(register.status, await register.clone().text()).toBe(200)

    const linked = await $fetch<{ id: number, resolvedId: number | null, column: boolean }>('/api/test/link', {
      method: 'POST',
      body: { email: 'ada@example.com', customerId: 'cus_ada' },
    })
    expect(linked.column).toBe(true)
    expect(linked.resolvedId).toBe(linked.id)

    const response = await postWebhook(makeEvent(eventId('user'), 'customer.subscription.updated', { customer: 'cus_ada' }))
    expect(response.status, await response.clone().text()).toBe(200)

    const calls = (await getCalls()).filter(call => call.id === eventId('user'))
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(call => call.userId === linked.id)).toBe(true)
  })

  it('passes userId null for an unknown customer', async () => {
    const response = await postWebhook(makeEvent(eventId('unknown'), 'customer.subscription.updated', { customer: 'cus_nobody' }))
    expect(response.status, await response.clone().text()).toBe(200)

    const calls = (await getCalls()).filter(call => call.id === eventId('unknown'))
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(call => call.userId === null)).toBe(true)
  })
})
