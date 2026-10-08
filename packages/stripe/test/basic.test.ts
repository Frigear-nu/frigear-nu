import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { eventId, getCalls, makeEvent, postWebhook, sign } from './helpers'

describe('stripe webhook (basic)', async () => {
  // NuxtHub KV persists processed event ids on disk, so start every run from a clean slate.
  const dataDir = fileURLToPath(new URL('./fixtures/basic/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
  })

  it('renders the index page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })

  it('rejects a request without a signature', async () => {
    const response = await postWebhook(makeEvent(eventId('nosig'), 'customer.created'), { signature: null })
    expect(response.status).toBe(400)
  })

  it('rejects a request with a bad signature', async () => {
    const event = makeEvent(eventId('badsig'), 'customer.created')
    const response = await postWebhook(event, { signature: sign(JSON.stringify(event), 'whsec_wrong') })
    expect(response.status).toBe(400)
    expect((await getCalls()).some(call => call.id === eventId('badsig'))).toBe(false)
  })

  it('rejects a payload that was tampered with after signing', async () => {
    const event = makeEvent(eventId('tamper'), 'customer.created')
    const signature = sign(JSON.stringify(event))
    const response = await postWebhook(event, { signature, payload: JSON.stringify({ ...event, id: eventId('other') }) })
    expect(response.status).toBe(400)
  })

  it('accepts a correctly signed payload and dispatches to matching handlers only', async () => {
    const response = await postWebhook(makeEvent(eventId('ok'), 'customer.created'))
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await response.json()).toMatchObject({ received: true })

    const calls = (await getCalls()).filter(call => call.id === eventId('ok'))
    expect(calls.map(call => call.handler)).toEqual(['registered', 'catch-all'])
  })

  it('runs build-time handlers and runtime onStripeEvent handlers in order', async () => {
    const response = await postWebhook(makeEvent(eventId('sub'), 'customer.subscription.updated'))
    expect(response.status).toBe(200)

    const calls = (await getCalls()).filter(call => call.id === eventId('sub'))
    // registered (order 100, build time) -> runtime (order 100, registered later) -> catch-all (order 200)
    expect(calls.map(call => call.handler)).toEqual(['registered', 'runtime', 'catch-all'])
    expect(calls.every(call => call.userId === null)).toBe(true)
  })

  it('does not run handlers for events nobody subscribed to specifically', async () => {
    await postWebhook(makeEvent(eventId('other'), 'product.created'))
    const calls = (await getCalls()).filter(call => call.id === eventId('other'))
    expect(calls.map(call => call.handler)).toEqual(['catch-all'])
  })

  it('processes a duplicate event id only once', async () => {
    const event = makeEvent(eventId('dup'), 'customer.created')
    const first = await postWebhook(event)
    const second = await postWebhook(event)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ received: true, duplicate: true })
    expect((await getCalls()).filter(call => call.id === eventId('dup') && call.handler === 'registered')).toHaveLength(1)
  })

  it('answers 5xx when a handler throws, still runs the other handlers, and is not marked processed', async () => {
    const event = makeEvent(eventId('fail'), 'invoice.payment_failed')
    const first = await postWebhook(event)
    expect(first.status).toBe(500)

    let calls = (await getCalls()).filter(call => call.id === eventId('fail'))
    expect(calls.map(call => call.handler)).toEqual(['failing', 'catch-all'])

    // Stripe retries: the event must be dispatched again rather than being treated as a duplicate.
    const retry = await postWebhook(event)
    expect(retry.status).toBe(500)
    calls = (await getCalls()).filter(call => call.id === eventId('fail'))
    expect(calls).toHaveLength(4)
  })
})
