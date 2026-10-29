import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { getHookCalls, getStripeCalls, registerUser, sendEvent } from './helpers'
import { authApi } from '@frigear-nu/auth/api'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { paymentsApi } from '../src/runtime/utils/api'

type Row = {
  id: string
  userId: number
  status: string
  amount: number
  currency: string
  referenceType: string | null
  referenceId: string | null
  checkoutSessionId: string | null
  invoiceId: string | null
  paymentIntentId: string | null
  refundedAmount: number
  paidAt: string | null
  items: Array<{ name: string, amount: number, currency: string, quantity?: number }> | null
}

const rows = () => $fetch<Row[]>('/api/test/payments')

async function pay(cookie: string, body: Record<string, unknown>) {
  return $fetch<{ payment: { id: string, status: string, amount: number }, url: string }>('/api/test/pay', {
    method: 'POST',
    headers: { cookie },
    body,
  })
}

const ticketItems = [
  { name: 'Ticket', amount: 15000, currency: 'DKK' },
  { name: 'Food', amount: 5000, currency: 'DKK', quantity: 2 },
]

let staffCookie: string | undefined
// The test policy (server/plugins/policy.ts) lets only staff@example.com administer users; register it once.
const registerStaff = async () => (staffCookie ??= (await registerUser('Staff', 'staff@example.com')).cookie)

describe('payments (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  describe('membership invoices (recordInvoicePayment)', () => {
    const invoice = (userId: number, overrides: Record<string, unknown> = {}) => ({
      userId,
      invoiceId: 'in_member_1',
      status: 'paid',
      amount: 49900,
      currency: 'dkk',
      description: 'Membership',
      referenceType: 'subscription',
      referenceId: 'sub_1',
      paymentIntentId: 'pi_member_1',
      paidAt: new Date().toISOString(),
      ...overrides,
    })
    const announce = (body: Record<string, unknown>) => $fetch('/api/test/invoice', { method: 'POST', body })

    it('stores a paid invoice as a payment once, fires payments:paid once and ignores late failures', async () => {
      const user = await registerUser('Mia', 'mia@example.com')
      await getHookCalls(true)
      await announce(invoice(user.id))
      await announce(invoice(user.id))
      await announce(invoice(user.id, { status: 'failed', paymentIntentId: null, paidAt: null }))

      const stored = (await rows()).filter(row => row.invoiceId === 'in_member_1')
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({ userId: user.id, status: 'paid', amount: 49900, referenceType: 'subscription', referenceId: 'sub_1', checkoutSessionId: null, paymentIntentId: 'pi_member_1' })
      expect(stored[0]!.paidAt).not.toBeNull()
      expect((await getHookCalls()).filter(call => call.paymentId === stored[0]!.id)).toEqual([
        { hook: 'payments:paid', paymentId: stored[0]!.id, status: 'paid', refundedAmount: 0 },
      ])
    })

    it('records a failed invoice, later paid, and applies a refund by payment intent', async () => {
      const user = await registerUser('Nils', 'nils@example.com')
      await announce(invoice(user.id, { invoiceId: 'in_member_2', status: 'failed', paymentIntentId: null, paidAt: null, referenceId: 'sub_2' }))
      expect((await rows()).find(row => row.invoiceId === 'in_member_2')).toMatchObject({ status: 'failed', paidAt: null })

      await announce(invoice(user.id, { invoiceId: 'in_member_2', paymentIntentId: 'pi_member_2', referenceId: 'sub_2' }))
      expect((await rows()).find(row => row.invoiceId === 'in_member_2')).toMatchObject({ status: 'paid' })

      await sendEvent('member_refund', 'charge.refunded', { payment_intent: 'pi_member_2', amount: 49900, amount_refunded: 49900 })
      expect((await rows()).find(row => row.invoiceId === 'in_member_2')).toMatchObject({ status: 'refunded', refundedAmount: 49900 })
    })
  })

  describe('createPayment', () => {
    it('creates a Checkout session with inline price_data and a pending row', async () => {
      const user = await registerUser('Ada', 'ada@example.com')
      await getStripeCalls(true)
      const result = await pay(user.cookie, { items: ticketItems, reference: { type: 'event_ticket', id: 'ticket_1' } })

      expect(result.url).toMatch(/^https:\/\/checkout\.stripe\.test\//)
      expect(result.payment).toMatchObject({ status: 'pending', amount: 25000 })

      const stored = (await rows()).find(row => row.id === result.payment.id)
      expect(stored).toMatchObject({ userId: user.id, status: 'pending', amount: 25000, currency: 'dkk', referenceType: 'event_ticket', referenceId: 'ticket_1', paymentIntentId: null })

      const session = (await getStripeCalls()).find(call => call.path === '/v1/checkout/sessions')!
      expect(session.params).toMatchObject({
        'mode': 'payment',
        'customer': user.customerId,
        'line_items[0][price_data][currency]': 'dkk',
        'line_items[0][price_data][unit_amount]': '15000',
        'line_items[1][quantity]': '2',
        'metadata[paymentId]': result.payment.id,
      })
    })

    it('rejects empty, mixed-currency, zero-amount and foreign-origin payments', async () => {
      const user = await registerUser('Bob', 'bob@example.com')
      const attempt = (body: Record<string, unknown>) => fetch('/api/test/pay', {
        method: 'POST',
        headers: { 'cookie': user.cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect((await attempt({ items: [] })).status).toBe(400)
      expect((await attempt({ items: [{ name: 'A', amount: 100, currency: 'DKK' }, { name: 'B', amount: 100, currency: 'EUR' }] })).status).toBe(400)
      expect((await attempt({ items: [{ name: 'Free', amount: 0, currency: 'DKK' }] })).status).toBe(400)
      expect((await attempt({ items: ticketItems, successUrl: 'https://evil.example/steal' })).status).toBe(400)
    })

    it('persists the items, and without a request only accepts absolute http(s) return URLs', async () => {
      const user = await registerUser('Kit', 'kit@example.com')
      const { payment } = await pay(user.cookie, { items: ticketItems })
      expect((await rows()).find(row => row.id === payment.id)!.items).toEqual(ticketItems)

      const attempt = (successUrl: string) => fetch('/api/test/pay', {
        method: 'POST',
        headers: { 'cookie': user.cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ items: ticketItems, noEvent: true, successUrl, cancelUrl: 'https://example.test/cancel' }),
      })
      expect((await attempt('/relative')).status).toBe(400)
      expect((await attempt('javascript:alert(1)')).status).toBe(400)
      expect((await attempt('https://example.test/done')).status).toBe(200)
    })
  })

  describe('stripe events', () => {
    it('marks the payment paid once, and ignores redelivery and unknown sessions', async () => {
      const user = await registerUser('Cy', 'cy@example.com')
      const { payment } = await pay(user.cookie, { items: ticketItems })
      const session = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId
      await getHookCalls(true)

      await sendEvent('paid_a', 'checkout.session.completed', { id: session, payment_status: 'paid', payment_intent: 'pi_cy' })
      // Same payload, new event id: the handler itself must be idempotent, not only the KV dedupe.
      await sendEvent('paid_b', 'checkout.session.completed', { id: session, payment_status: 'paid', payment_intent: 'pi_cy' })
      await sendEvent('unknown', 'checkout.session.completed', { id: 'cs_not_ours', payment_status: 'paid', payment_intent: 'pi_x' })

      const stored = (await rows()).find(row => row.id === payment.id)!
      expect(stored).toMatchObject({ status: 'paid', paymentIntentId: 'pi_cy' })
      expect(stored.paidAt).not.toBeNull()
      expect((await getHookCalls()).filter(call => call.hook === 'payments:paid')).toEqual([
        { hook: 'payments:paid', paymentId: payment.id, status: 'paid', refundedAmount: 0 },
      ])
    })

    it('waits for async_payment_succeeded when the session is not yet paid', async () => {
      const user = await registerUser('Di', 'di@example.com')
      const { payment } = await pay(user.cookie, { items: ticketItems })
      const session = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId

      await sendEvent('async_unpaid', 'checkout.session.completed', { id: session, payment_status: 'unpaid', payment_intent: 'pi_di' })
      expect((await rows()).find(row => row.id === payment.id)!.status).toBe('pending')

      await sendEvent('async_ok', 'checkout.session.async_payment_succeeded', { id: session, payment_status: 'paid', payment_intent: 'pi_di' })
      expect((await rows()).find(row => row.id === payment.id)!.status).toBe('paid')
    })

    it('handles failed and expired sessions, and never downgrades a paid payment', async () => {
      const user = await registerUser('Ed', 'ed@example.com')
      const failed = await pay(user.cookie, { items: ticketItems })
      const expired = await pay(user.cookie, { items: ticketItems })
      const paid = await pay(user.cookie, { items: ticketItems })
      const sessionOf = async (id: string) => (await rows()).find(row => row.id === id)!.checkoutSessionId
      await getHookCalls(true)

      await sendEvent('failed', 'checkout.session.async_payment_failed', { id: await sessionOf(failed.payment.id) })
      await sendEvent('expired', 'checkout.session.expired', { id: await sessionOf(expired.payment.id) })
      await sendEvent('paid_first', 'checkout.session.completed', { id: await sessionOf(paid.payment.id), payment_status: 'paid', payment_intent: 'pi_ed' })
      await sendEvent('expired_late', 'checkout.session.expired', { id: await sessionOf(paid.payment.id) })

      const all = await rows()
      expect(all.find(row => row.id === failed.payment.id)!.status).toBe('failed')
      expect(all.find(row => row.id === expired.payment.id)!.status).toBe('expired')
      expect(all.find(row => row.id === paid.payment.id)!.status).toBe('paid')
      expect((await getHookCalls()).map(call => call.hook).sort()).toEqual(['payments:expired', 'payments:failed', 'payments:paid'])
    })

    it('tracks partial and full refunds from charge.refunded', async () => {
      const user = await registerUser('Flo', 'flo@example.com')
      const { payment } = await pay(user.cookie, { items: ticketItems })
      const session = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId
      await sendEvent('ref_paid', 'checkout.session.completed', { id: session, payment_status: 'paid', payment_intent: 'pi_flo' })
      await getHookCalls(true)

      await sendEvent('ref_part', 'charge.refunded', { payment_intent: 'pi_flo', amount: 25000, amount_refunded: 5000 })
      expect((await rows()).find(row => row.id === payment.id)).toMatchObject({ status: 'partially_refunded', refundedAmount: 5000 })

      await sendEvent('ref_full', 'charge.refunded', { payment_intent: 'pi_flo', amount: 25000, amount_refunded: 25000 })
      expect((await rows()).find(row => row.id === payment.id)).toMatchObject({ status: 'refunded', refundedAmount: 25000 })

      await sendEvent('ref_dup', 'charge.refunded', { payment_intent: 'pi_flo', amount: 25000, amount_refunded: 25000 })
      expect((await getHookCalls()).map(call => call.status)).toEqual(['partially_refunded', 'refunded'])
    })
  })

  describe('API', () => {
    it('lists only the signed-in user\'s payments and requires a session', async () => {
      const gus = await registerUser('Gus', 'gus@example.com')
      const hal = await registerUser('Hal', 'hal@example.com')
      const mine = await pay(gus.cookie, { items: ticketItems })
      await pay(hal.cookie, { items: ticketItems })

      const list = await apiClient({ cookie: gus.cookie }).json<Array<{ id: string, userId: number, checkoutSessionId?: unknown }>>('GET', paymentsApi.me.list)
      expect(list.map(item => item.id)).toEqual([mine.payment.id])
      // An allowlisted DTO: no Stripe ids.
      expect(list[0]).not.toHaveProperty('checkoutSessionId')
      await expectApiError(apiClient().json('GET', paymentsApi.me.list), 401)
    })

    it('resumes with the open session, or a fresh one once expired, but never when paid', async () => {
      const user = await registerUser('Ivy', 'ivy@example.com')
      const other = await registerUser('Jon', 'jon@example.com')
      const { payment, url } = await pay(user.cookie, { items: ticketItems })
      const resume = (cookie: string, id: string) => apiClient({ cookie }).json<{ url: string }>('POST', paymentsApi.me.resume(id))

      expect(await resume(user.cookie, payment.id)).toEqual({ url })
      await expectApiError(resume(other.cookie, payment.id), 404, 'not_found')
      await expectApiError(apiClient().json('POST', paymentsApi.me.resume(payment.id)), 401)

      const oldSession = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId
      await $fetch('/api/test/expire-session', { method: 'POST', body: { id: oldSession } })
      const fresh = await resume(user.cookie, payment.id)
      expect(fresh.url).not.toBe(url)
      const newSession = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId
      expect(newSession).not.toBe(oldSession)

      await sendEvent('resume_paid', 'checkout.session.completed', { id: newSession, payment_status: 'paid', payment_intent: 'pi_ivy' })
      await expectApiError(resume(user.cookie, payment.id), 409, 'conflict')
    })
  })

  describe('resumePayment after the session expired', () => {
    const resume = async (cookie: string, id: string) => {
      await apiClient({ cookie }).json('POST', paymentsApi.me.resume(id))
    }
    const lastSession = async () => (await getStripeCalls()).filter(call => call.method === 'POST' && call.path === '/v1/checkout/sessions').at(-1)!
    const expire = async (id: string) => {
      const session = (await rows()).find(row => row.id === id)!.checkoutSessionId
      await $fetch('/api/test/expire-session', { method: 'POST', body: { id: session } })
    }

    it('rebuilds the session from the original items and runs payments:checkout:before', async () => {
      const user = await registerUser('Lea', 'lea@example.com')
      const { payment } = await pay(user.cookie, {
        items: [...ticketItems, { name: 'Wine', description: 'Red', amount: 7500, currency: 'DKK', quantity: 3 }],
        reference: { type: 'event_ticket', id: 'resume_1' },
      })
      await expire(payment.id)
      await getStripeCalls(true)
      await resume(user.cookie, payment.id)

      expect((await lastSession()).params).toMatchObject({
        'line_items[0][price_data][product_data][name]': 'Ticket',
        'line_items[0][price_data][unit_amount]': '15000',
        'line_items[1][price_data][product_data][name]': 'Food',
        'line_items[1][quantity]': '2',
        'line_items[2][price_data][product_data][name]': 'Wine',
        'line_items[2][price_data][product_data][description]': 'Red',
        'line_items[2][price_data][unit_amount]': '7500',
        'line_items[2][quantity]': '3',
        'metadata[paymentId]': payment.id,
        'metadata[hooked]': 'resume_1',
        'success_url': expect.stringContaining('/done'),
      })
    })

    it('falls back to a single line for rows without stored items, still running the hook', async () => {
      const user = await registerUser('Max', 'max@example.com')
      const { payment } = await pay(user.cookie, { items: ticketItems })
      await $fetch('/api/test/clear-items', { method: 'POST', body: { id: payment.id } })
      await expire(payment.id)
      await getStripeCalls(true)
      await resume(user.cookie, payment.id)

      const { params } = await lastSession()
      expect(params).toMatchObject({
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][product_data][name]': 'Payment',
        'line_items[0][price_data][unit_amount]': '25000',
        'metadata[hooked]': 'none',
      })
      expect(params['line_items[1][quantity]']).toBeUndefined()
    })
  })

  describe('API tokens', () => {
    const createToken = async (cookie: string, scopes: string[]) => {
      const response = await fetch(authApi.me.tokens, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'test', scopes }),
      })
      expect(response.status, await response.clone().text()).toBe(201)
      return (await response.json() as { token: string }).token
    }
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

    it('lists payments for a token with the scope only', async () => {
      const user = await registerUser('Token', 'token@example.com')
      const read = await createToken(user.cookie, ['payments:read'])
      expect((await fetch(paymentsApi.me.list, { headers: bearer(read) })).status).toBe(200)
      await expectApiError(apiClient({ bearer: await createToken(user.cookie, ['payments:write']) }).json('GET', paymentsApi.me.list), 403, 'insufficient_scope')
      await expectApiError(apiClient({ bearer: 'fnu_invalid' }).json('GET', paymentsApi.me.list), 401)
    })

    it('resumes a payment with the write scope', async () => {
      const user = await registerUser('Token Two', 'token-two@example.com')
      const { payment, url } = await pay(user.cookie, { items: ticketItems })
      const write = await createToken(user.cookie, ['payments:write'])
      expect(await apiClient({ bearer: write }).json('POST', paymentsApi.me.resume(payment.id))).toEqual({ url })
    })
  })

  describe('admin: a user\'s payments', () => {
    it('is closed to guests and users the host policy does not allow, and 404s unknown users', async () => {
      const staffCookie = await registerStaff()
      const member = await registerUser('Member', 'member@example.com')

      await expectApiError(apiClient().json('GET', paymentsApi.admin.userPayments(member.id)), 401)
      await expectApiError(apiClient({ cookie: member.cookie }).json('GET', paymentsApi.admin.userPayments(member.id)), 403)
      await expectApiError(apiClient({ cookie: staffCookie }).json('GET', paymentsApi.admin.userPayments('nope')), 400)
      await expectApiError(apiClient({ cookie: staffCookie }).json('GET', paymentsApi.admin.userPayments(99999)), 404)
    })

    it('lists the user\'s payments for allowed staff, honouring limit', async () => {
      const staff = await registerUser('Staff Two', 'staff-two@example.com')
      const user = await registerUser('Paying', 'paying@example.com')
      const first = await pay(user.cookie, { items: ticketItems, reference: { type: 'event_ticket', id: 'admin_1' } })
      const second = await pay(user.cookie, { items: [{ name: 'Ticket', amount: 1000, currency: 'DKK' }] })

      // Only the configured staff account passes the test policy.
      await expectApiError(apiClient({ cookie: staff.cookie }).json('GET', paymentsApi.admin.userPayments(user.id)), 403)

      const admin = apiClient({ cookie: await registerStaff() })
      const list = await admin.json<{ id: string, userId: number }[]>('GET', paymentsApi.admin.userPayments(user.id))
      // Newest first by `createdAt` (second resolution), so two payments in the same second may swap.
      expect(list.map(payment => payment.id).sort()).toEqual([first.payment.id, second.payment.id].sort())
      expect(list.every(payment => payment.userId === user.id)).toBe(true)

      expect(await admin.json<unknown[]>('GET', `${paymentsApi.admin.userPayments(user.id)}?limit=1`)).toHaveLength(1)
      await expectApiError(admin.json('GET', `${paymentsApi.admin.userPayments(user.id)}?limit=0`), 400)
    })
  })

  describe('admin: recent payments', () => {
    it('shows the dashboard object to allowed staff only', async () => {
      const member = await registerUser('Dash Member', 'dash-member@example.com')
      const buyer = await registerUser('Buyer', 'buyer@example.com')
      const { payment } = await pay(buyer.cookie, { items: ticketItems })
      const session = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId
      await sendEvent('recent_paid', 'checkout.session.completed', { id: session, payment_status: 'paid', payment_intent: 'pi_recent' })

      const staff = apiClient({ cookie: await registerStaff() })
      const recent = await staff.json<{ days: number, revenue: Array<{ currency: string, amount: number, count: number }>, items: Array<{ id: string, userName: string | null, checkoutSessionId?: unknown }> }>('GET', paymentsApi.admin.recent)
      expect(recent.days).toBe(30)
      expect(recent.revenue.find(entry => entry.currency === 'dkk')?.amount).toBeGreaterThanOrEqual(25000)
      expect(recent.items.find(item => item.id === payment.id)).toMatchObject({ userName: 'Buyer' })
      expect(recent.items[0]).not.toHaveProperty('checkoutSessionId')

      await expectApiError(apiClient().json('GET', paymentsApi.admin.recent), 401)
      await expectApiError(apiClient({ cookie: member.cookie }).json('GET', paymentsApi.admin.recent), 403, 'forbidden')
    })
  })
})
