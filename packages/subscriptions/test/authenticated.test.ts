import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { eventId, getStripeCalls, iso, makeEvent, postWebhook, subscriptionObject } from './helpers'

type Row = {
  id: string
  userId: number
  planKey: string | null
  priceId: string
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  endedAt: string | null
}

async function registerUser(name: string, email: string, customerId?: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(200)
  const cookie = response.headers.get('set-cookie')!
  const { id } = await $fetch<{ id: number }>('/api/test/link', { method: 'POST', body: { email, customerId: customerId ?? `cus_${email}` } })
  return { cookie, id, customerId: customerId ?? `cus_${email}` }
}

const sendSubscription = async (type: string, name: string, options: Parameters<typeof subscriptionObject>[0]) => {
  const response = await postWebhook(makeEvent(eventId(name), type, subscriptionObject(options)))
  expect(response.status, await response.clone().text()).toBe(200)
}

const rows = () => $fetch<Row[]>('/api/test/subscriptions')
const row = async (id: string) => (await rows()).find(item => item.id === id)

describe('subscriptions (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true })

  describe('webhook handlers', () => {
    it('inserts a subscription for a known user, resolving the plan by lookup key', async () => {
      const user = await registerUser('Ada', 'ada@example.com')
      await sendSubscription('customer.subscription.created', 'create', {
        id: 'sub_create', customer: user.customerId, priceId: 'price_member_y', lookupKey: 'member_yearly', status: 'trialing',
      })

      const stored = await row('sub_create')
      expect(stored).toMatchObject({ userId: user.id, planKey: 'member', priceId: 'price_member_y', status: 'trialing', cancelAtPeriodEnd: false, endedAt: null })
      expect(stored?.currentPeriodStart).toBe(iso(1700000000))
      expect(stored?.currentPeriodEnd).toBe(iso(1702592000))
    })

    it('resolves the plan by price id', async () => {
      const user = await registerUser('Patron', 'patron@example.com')
      await sendSubscription('customer.subscription.created', 'patron', { id: 'sub_patron', customer: user.customerId, priceId: 'price_patron_y' })
      expect(await row('sub_patron')).toMatchObject({ planKey: 'patron' })
    })

    it('updates the same row (no duplicates) on later events', async () => {
      const user = await registerUser('Grace', 'grace@example.com')
      await sendSubscription('customer.subscription.created', 'u1', { id: 'sub_update', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly' })
      await sendSubscription('customer.subscription.updated', 'u2', {
        id: 'sub_update', customer: user.customerId, priceId: 'price_patron_y', status: 'past_due', cancelAtPeriodEnd: true, end: 1705000000,
      })

      const matching = (await rows()).filter(item => item.id === 'sub_update')
      expect(matching).toHaveLength(1)
      expect(matching[0]).toMatchObject({ planKey: 'patron', status: 'past_due', cancelAtPeriodEnd: true, currentPeriodEnd: iso(1705000000) })
    })

    it('keeps the row and sets endedAt when a subscription is deleted', async () => {
      const user = await registerUser('Hedy', 'hedy@example.com')
      await sendSubscription('customer.subscription.created', 'd1', { id: 'sub_deleted', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly' })
      await sendSubscription('customer.subscription.deleted', 'd2', { id: 'sub_deleted', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly', status: 'canceled', endedAt: 1710000000 })

      const stored = await row('sub_deleted')
      expect(stored).toMatchObject({ status: 'canceled', endedAt: iso(1710000000) })
    })

    it('ignores events for an unknown customer without failing the webhook', async () => {
      await sendSubscription('customer.subscription.created', 'nobody', { id: 'sub_nobody', customer: 'cus_does_not_exist', priceId: 'price_member_m' })
      expect(await row('sub_nobody')).toBeUndefined()
    })

    it('stores unknown prices with planKey null', async () => {
      const user = await registerUser('Unknown', 'unknown-price@example.com')
      await sendSubscription('customer.subscription.created', 'unk', { id: 'sub_unknown_price', customer: user.customerId, priceId: 'price_not_configured', lookupKey: 'other' })
      expect(await row('sub_unknown_price')).toMatchObject({ planKey: null, priceId: 'price_not_configured', status: 'active' })
    })

    it('handles paused and resumed events', async () => {
      const user = await registerUser('Pause', 'pause@example.com')
      await sendSubscription('customer.subscription.paused', 'p1', { id: 'sub_pause', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly', status: 'paused' })
      expect(await row('sub_pause')).toMatchObject({ status: 'paused' })
      await sendSubscription('customer.subscription.resumed', 'p2', { id: 'sub_pause', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly', status: 'active' })
      expect(await row('sub_pause')).toMatchObject({ status: 'active' })
    })
  })

  describe('protected routes', () => {
    it('rejects anonymous access with 401', async () => {
      await expect($fetch('/api/subscriptions/me')).rejects.toMatchObject({ statusCode: 401 })
      await expect($fetch('/api/subscriptions/checkout', { method: 'POST', body: { planKey: 'member' } })).rejects.toMatchObject({ statusCode: 401 })
      await expect($fetch('/api/subscriptions/portal', { method: 'POST', body: {} })).rejects.toMatchObject({ statusCode: 401 })
    })
  })

  describe('GET /api/subscriptions/plans', () => {
    it('lists configured plans with live prices from Stripe, filtered by the policy hook', async () => {
      const { plans } = await $fetch<{ plans: Array<{ key: string, label: string, description?: string, rank: number, prices: Array<Record<string, unknown>> }> }>('/api/subscriptions/plans')

      // `secret` is hidden by the fixture's `subscriptions:plans:filter` hook.
      expect(plans.map(plan => plan.key)).toEqual(['member', 'patron'])
      expect(plans[0]).toMatchObject({ key: 'member', label: 'Member', description: 'Basic membership', rank: 1 })
      expect(plans[0]!.prices).toEqual(expect.arrayContaining([
        { id: 'price_member_m', amount: 500, currency: 'usd', interval: 'month', intervalCount: 1, trialPeriodDays: null, lookupKey: 'member_monthly' },
        { id: 'price_member_y', amount: 5000, currency: 'usd', interval: 'year', intervalCount: 1, trialPeriodDays: 14, lookupKey: 'member_yearly' },
      ]))
      expect(plans[1]).toMatchObject({ key: 'patron', label: 'Patron', rank: 2 })
      expect(plans[1]!.prices).toEqual([{ id: 'price_patron_y', amount: 20000, currency: 'usd', interval: 'year', intervalCount: 1, trialPeriodDays: null, lookupKey: null }])
    })

    it('lets the policy hook adjust the response per request', async () => {
      const { plans } = await $fetch<{ plans: Array<{ key: string }> }>('/api/subscriptions/plans?hide=member')
      expect(plans.map(plan => plan.key)).toEqual(['patron', 'secret'])
    })

    it('caches Stripe lookups', async () => {
      await $fetch('/api/subscriptions/plans')
      await getStripeCalls(true)
      await $fetch('/api/subscriptions/plans')
      expect((await getStripeCalls()).filter(call => call.path.startsWith('/v1/prices'))).toHaveLength(0)
    })
  })

  describe('GET /api/subscriptions/me', () => {
    it('returns the user\'s subscriptions and the derived active plan', async () => {
      const user = await registerUser('Me', 'me@example.com')
      expect(await $fetch('/api/subscriptions/me', { headers: { cookie: user.cookie } })).toEqual({ subscriptions: [], activePlan: null })

      await sendSubscription('customer.subscription.created', 'me1', { id: 'sub_me', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly' })
      const me = await $fetch<{ subscriptions: Array<Record<string, unknown>>, activePlan: string | null }>('/api/subscriptions/me', { headers: { cookie: user.cookie } })
      expect(me.activePlan).toBe('member')
      expect(me.subscriptions).toEqual([{
        id: 'sub_me',
        planKey: 'member',
        priceId: 'price_member_m',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodStart: iso(1700000000),
        currentPeriodEnd: iso(1702592000),
        endedAt: null,
      }])
    })
  })

  describe('POST /api/subscriptions/checkout', () => {
    it('creates a Stripe Checkout session for a new subscriber with default URLs', async () => {
      const user = await registerUser('Buyer', 'buyer@example.com')
      await getStripeCalls(true)

      const result = await $fetch<{ url: string }>('/api/subscriptions/checkout', {
        method: 'POST', headers: { cookie: user.cookie }, body: { planKey: 'patron' },
      })
      expect(result.url).toBe('https://checkout.stripe.test/c/cs_test_1')

      const call = (await getStripeCalls()).find(item => item.path === '/v1/checkout/sessions')!
      expect(call.params).toMatchObject({
        'mode': 'subscription',
        'customer': user.customerId,
        'line_items[0][price]': 'price_patron_y',
        'client_reference_id': String(user.id),
        'subscription_data[metadata][planKey]': 'patron',
      })
      expect(call.params.success_url).toMatch(/\/account\/membership\/success$/)
      expect(call.params.cancel_url).toMatch(/\/account\/membership\/cancel$/)
    })

    it('requires a priceId when a plan has several prices, and accepts one that belongs to it', async () => {
      const user = await registerUser('Multi', 'multi@example.com')
      await expect($fetch('/api/subscriptions/checkout', { method: 'POST', headers: { cookie: user.cookie }, body: { planKey: 'member' } }))
        .rejects.toMatchObject({ statusCode: 400 })
      const ok = await $fetch<{ url: string }>('/api/subscriptions/checkout', { method: 'POST', headers: { cookie: user.cookie }, body: { planKey: 'member', priceId: 'price_member_y' } })
      expect(ok.url).toContain('checkout.stripe.test')
    })

    it('rejects unknown plans/prices, hidden plans, and invalid bodies', async () => {
      const user = await registerUser('Bad', 'bad@example.com')
      const post = (body: Record<string, unknown>) => $fetch('/api/subscriptions/checkout', { method: 'POST', headers: { cookie: user.cookie }, body })
      await expect(post({ planKey: 'nope' })).rejects.toMatchObject({ statusCode: 400 })
      await expect(post({ priceId: 'price_nope' })).rejects.toMatchObject({ statusCode: 400 })
      await expect(post({ planKey: 'secret' })).rejects.toMatchObject({ statusCode: 400 })
      await expect(post({})).rejects.toMatchObject({ statusCode: 400 })
    })

    it('accepts relative and same-origin absolute URLs, and rejects other origins', async () => {
      const user = await registerUser('Urls', 'urls@example.com')
      const post = (body: Record<string, unknown>) => $fetch<{ url: string }>('/api/subscriptions/checkout', { method: 'POST', headers: { cookie: user.cookie }, body })

      await getStripeCalls(true)
      await post({ planKey: 'patron', successUrl: '/thanks' })
      const call = (await getStripeCalls()).find(item => item.path === '/v1/checkout/sessions')!
      expect(call.params.success_url).toMatch(/^https?:\/\/[^/]+\/thanks$/)

      const origin = new URL(call.params.success_url!).origin
      await expect(post({ planKey: 'patron', successUrl: `${origin}/abs`, cancelUrl: `${origin}/abs-cancel` })).resolves.toHaveProperty('url')
      await expect(post({ planKey: 'patron', successUrl: 'https://evil.example/x' })).rejects.toMatchObject({ statusCode: 400 })
      await expect(post({ planKey: 'patron', cancelUrl: '//evil.example' })).rejects.toMatchObject({ statusCode: 400 })
    })

    it('lets the before-hook deny a checkout', async () => {
      const user = await registerUser('Denied', 'denied@example.com')
      await expect($fetch('/api/subscriptions/checkout', {
        method: 'POST', headers: { 'cookie': user.cookie, 'x-deny': '1' }, body: { planKey: 'patron' },
      })).rejects.toMatchObject({ statusCode: 403 })
    })

    it('lets the before-hook adjust the Checkout params', async () => {
      const user = await registerUser('Trial', 'trial@example.com')
      await getStripeCalls(true)
      await $fetch('/api/subscriptions/checkout', { method: 'POST', headers: { 'cookie': user.cookie, 'x-trial': '1' }, body: { planKey: 'patron' } })
      const call = (await getStripeCalls()).find(item => item.path === '/v1/checkout/sessions')!
      expect(call.params['subscription_data[trial_period_days]']).toBe('7')
    })

    it('upgrades immediately with always_invoice proration when moving to a higher-ranked plan', async () => {
      const user = await registerUser('Up', 'up@example.com')
      await sendSubscription('customer.subscription.created', 'up', { id: 'sub_up', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly' })
      await getStripeCalls(true)

      const result = await $fetch('/api/subscriptions/checkout', { method: 'POST', headers: { cookie: user.cookie }, body: { planKey: 'patron' } })
      expect(result).toEqual({ updated: true, kind: 'upgrade' })

      const calls = await getStripeCalls()
      expect(calls.some(call => call.path === '/v1/checkout/sessions')).toBe(false)
      const update = calls.find(call => call.method === 'POST' && call.path === '/v1/subscriptions/sub_up')!
      expect(update.params).toMatchObject({
        'proration_behavior': 'always_invoice',
        'items[0][id]': 'si_1',
        'items[0][price]': 'price_patron_y',
      })
    })

    it('schedules a downgrade at period end when moving to a lower-ranked plan', async () => {
      const user = await registerUser('Down', 'down@example.com')
      await sendSubscription('customer.subscription.created', 'down', { id: 'sub_down', customer: user.customerId, priceId: 'price_patron_y' })
      await getStripeCalls(true)

      const result = await $fetch('/api/subscriptions/checkout', { method: 'POST', headers: { cookie: user.cookie }, body: { planKey: 'member', priceId: 'price_member_m' } })
      expect(result).toEqual({ updated: true, kind: 'downgrade' })

      const calls = await getStripeCalls()
      expect(calls.find(call => call.path === '/v1/subscription_schedules' && call.method === 'POST')!.params).toMatchObject({ from_subscription: 'sub_down' })
      const update = calls.find(call => call.path === '/v1/subscription_schedules/sub_sched_1')!
      expect(update.params).toMatchObject({
        'end_behavior': 'release',
        'phases[0][items][0][price]': 'price_patron_y',
        'phases[0][end_date]': '1702592000',
        'phases[1][items][0][price]': 'price_member_m',
        'phases[1][iterations]': '1',
      })
      expect(calls.some(call => call.method === 'POST' && call.path === '/v1/subscriptions/sub_down')).toBe(false)
    })

    it('refuses to subscribe to the price the user already holds', async () => {
      const user = await registerUser('Same', 'same@example.com')
      await sendSubscription('customer.subscription.created', 'same', { id: 'sub_same', customer: user.customerId, priceId: 'price_patron_y' })
      await expect($fetch('/api/subscriptions/checkout', { method: 'POST', headers: { cookie: user.cookie }, body: { planKey: 'patron' } }))
        .rejects.toMatchObject({ statusCode: 409 })
    })
  })

  describe('POST /api/subscriptions/portal', () => {
    it('creates a billing portal session for the user\'s customer', async () => {
      const user = await registerUser('Portal', 'portal@example.com')
      await getStripeCalls(true)

      const result = await $fetch<{ url: string }>('/api/subscriptions/portal', { method: 'POST', headers: { cookie: user.cookie }, body: { returnUrl: '/account/membership' } })
      expect(result.url).toBe('https://billing.stripe.test/p/session')

      const call = (await getStripeCalls()).find(item => item.path === '/v1/billing_portal/sessions')!
      expect(call.params.customer).toBe(user.customerId)
      expect(call.params.return_url).toMatch(/\/account\/membership$/)
    })

    it('rejects a return URL on another origin', async () => {
      const user = await registerUser('Portal2', 'portal2@example.com')
      await expect($fetch('/api/subscriptions/portal', { method: 'POST', headers: { cookie: user.cookie }, body: { returnUrl: 'https://evil.example' } }))
        .rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('entitlements', () => {
    it('answers hasActiveSubscription / getUserSubscription from stored rows', async () => {
      const user = await registerUser('Entitled', 'entitled@example.com')
      const check = (query = '') => $fetch<{ has: boolean, autoImported: boolean, subscriptionId: string | null }>(`/api/test/entitlement?userId=${user.id}${query}`)

      expect(await check()).toMatchObject({ has: false, subscriptionId: null })

      await sendSubscription('customer.subscription.created', 'ent1', { id: 'sub_ent', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly', status: 'trialing' })
      expect(await check()).toEqual({ has: true, autoImported: true, subscriptionId: 'sub_ent' })
      expect((await check('&plans=member')).has).toBe(true)
      expect((await check('&plans=patron')).has).toBe(false)
      expect((await check('&statuses=active')).has).toBe(false)
      expect((await check('&statuses=active,trialing')).has).toBe(true)

      await sendSubscription('customer.subscription.updated', 'ent2', { id: 'sub_ent', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly', status: 'past_due' })
      expect((await check()).has).toBe(false)
      expect((await check('&statuses=past_due')).has).toBe(true)

      await sendSubscription('customer.subscription.deleted', 'ent3', { id: 'sub_ent', customer: user.customerId, priceId: 'price_member_m', lookupKey: 'member_monthly', status: 'canceled', endedAt: 1710000000 })
      expect((await check('&statuses=past_due,canceled')).has).toBe(false)
    })
  })
})
