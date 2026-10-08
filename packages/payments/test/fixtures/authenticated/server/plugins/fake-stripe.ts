// Test-only: replaces the global `fetch` before Stripe's (fetch based) HTTP client is created, so no
// request ever leaves the process. Calls are recorded and served from `/api/test/stripe-calls`.
export type FakeStripeCall = { method: string, path: string, params: Record<string, string> }

const calls: FakeStripeCall[] = []
let customerCounter = 0

const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json', 'request-id': 'req_fake' },
})

// Sessions the fake knows about: id -> status/url, so `retrieve` can report open/expired/complete.
export const fakeSessions = new Map<string, { status: 'open' | 'expired' | 'complete', url: string, success_url: string, cancel_url: string }>()
let sessionCounter = 0

function respond(call: FakeStripeCall): Response {
  const { method, path, params } = call
  if (path === '/v1/customers/search') return json({ object: 'search_result', has_more: false, data: [] })
  if (method === 'POST' && path === '/v1/customers') return json({ id: `cus_fake_${++customerCounter}`, object: 'customer' })
  if (method === 'POST' && path === '/v1/checkout/sessions') {
    const id = `cs_test_${++sessionCounter}`
    const url = `https://checkout.stripe.test/c/${id}`
    fakeSessions.set(id, { status: 'open', url, success_url: params.success_url!, cancel_url: params.cancel_url! })
    return json({ id, object: 'checkout.session', url, status: 'open' })
  }
  const expire = path.match(/^\/v1\/checkout\/sessions\/(.+)\/expire$/)
  if (method === 'POST' && expire) {
    const session = fakeSessions.get(expire[1]!)
    if (session) session.status = 'expired'
    return json({ id: expire[1], object: 'checkout.session', status: 'expired' })
  }
  const retrieve = path.match(/^\/v1\/checkout\/sessions\/(.+)$/)
  if (method === 'GET' && retrieve) {
    const session = fakeSessions.get(retrieve[1]!)
    return json({ id: retrieve[1], object: 'checkout.session', status: session?.status ?? 'expired', url: session?.status === 'open' ? session.url : null, success_url: session?.success_url, cancel_url: session?.cancel_url })
  }
  if (method === 'POST' && path === '/v1/refunds') return json({ id: 're_1', object: 'refund', status: 'succeeded', amount: Number(params.amount ?? 0) })
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
