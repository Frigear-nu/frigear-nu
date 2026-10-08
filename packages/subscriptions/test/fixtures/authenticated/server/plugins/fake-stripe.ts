// Test-only: replaces the global `fetch` before Stripe's (fetch based) HTTP client is created, so no
// request ever leaves the process. Calls are recorded and served from `/api/test/stripe-calls`.
export type FakeStripeCall = { method: string, path: string, params: Record<string, string> }

const prices: Record<string, Record<string, unknown>> = {
  price_member_m: { id: 'price_member_m', object: 'price', active: true, currency: 'usd', unit_amount: 500, lookup_key: 'member_monthly', recurring: { interval: 'month', interval_count: 1, trial_period_days: null } },
  price_member_y: { id: 'price_member_y', object: 'price', active: true, currency: 'usd', unit_amount: 5000, lookup_key: 'member_yearly', recurring: { interval: 'year', interval_count: 1, trial_period_days: 14 } },
  price_patron_y: { id: 'price_patron_y', object: 'price', active: true, currency: 'usd', unit_amount: 20000, lookup_key: null, recurring: { interval: 'year', interval_count: 1, trial_period_days: null } },
  price_secret_m: { id: 'price_secret_m', object: 'price', active: true, currency: 'usd', unit_amount: 100, lookup_key: null, recurring: { interval: 'month', interval_count: 1, trial_period_days: null } },
}

// What the fake `subscriptions.retrieve` returns: the price it currently holds.
const subscriptionPrices: Record<string, string> = {
  sub_up: 'price_member_m',
  sub_down: 'price_patron_y',
}

const calls: FakeStripeCall[] = []
let customerCounter = 0

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json', 'request-id': 'req_fake' },
})

function respond(call: FakeStripeCall): Response {
  const { method, path, params } = call
  if (method === 'GET' && path === '/v1/prices') {
    const keys = Object.entries(params).filter(([key]) => key.startsWith('lookup_keys')).map(([, value]) => value)
    return json({ object: 'list', has_more: false, url: '/v1/prices', data: Object.values(prices).filter(price => keys.includes(price.lookup_key as string)) })
  }
  const priceMatch = path.match(/^\/v1\/prices\/(.+)$/)
  if (method === 'GET' && priceMatch) return json(prices[priceMatch[1]!] ?? { error: { type: 'invalid_request_error', message: 'No such price' } })
  if (path === '/v1/customers/search') return json({ object: 'search_result', has_more: false, data: [] })
  if (method === 'POST' && path === '/v1/customers') return json({ id: `cus_fake_${++customerCounter}`, object: 'customer' })
  if (method === 'POST' && path === '/v1/checkout/sessions') return json({ id: 'cs_test_1', object: 'checkout.session', url: 'https://checkout.stripe.test/c/cs_test_1' })
  if (method === 'POST' && path === '/v1/billing_portal/sessions') return json({ id: 'bps_1', object: 'billing_portal.session', url: 'https://billing.stripe.test/p/session' })
  const subMatch = path.match(/^\/v1\/subscriptions\/(.+)$/)
  if (subMatch) {
    const id = subMatch[1]!
    return json({ id, object: 'subscription', schedule: null, items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', quantity: 1, price: { id: subscriptionPrices[id] ?? 'price_member_m' } }] } })
  }
  if (method === 'POST' && path === '/v1/subscription_schedules') {
    return json({ id: 'sub_sched_1', object: 'subscription_schedule', phases: [{ start_date: 1700000000, end_date: 1702592000, items: [] }] })
  }
  if (path.startsWith('/v1/subscription_schedules/')) {
    return json({ id: 'sub_sched_1', object: 'subscription_schedule', phases: [] })
  }
  return json({ error: { type: 'invalid_request_error', message: `Unhandled fake Stripe call: ${method} ${path}` } })
}

export const getFakeStripeCalls = () => calls
export const resetFakeStripeCalls = () => {
  calls.length = 0
}

export default defineNitroPlugin(() => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.hostname !== 'api.stripe.com') return realFetch(input, init)

    const params: Record<string, string> = Object.fromEntries(url.searchParams)
    if (typeof init?.body === 'string') Object.assign(params, Object.fromEntries(new URLSearchParams(init.body)))
    const call = { method: (init?.method ?? 'GET').toUpperCase(), path: url.pathname, params }
    calls.push(call)
    const response = respond(call)
    return response
  }) as typeof fetch
})
