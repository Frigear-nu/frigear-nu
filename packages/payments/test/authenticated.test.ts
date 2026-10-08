import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { getHookCalls, getStripeCalls, registerUser, sendEvent } from './helpers'

type Row = {
  id: string
  userId: number
  status: string
  amount: number
  currency: string
  referenceType: string | null
  referenceId: string | null
  checkoutSessionId: string
  paymentIntentId: string | null
  refundedAmount: number
  paidAt: string | null
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

describe('payments (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true })

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

      const list = await $fetch<Array<{ id: string, userId: number }>>('/api/payments', { headers: { cookie: gus.cookie } })
      expect(list.map(item => item.id)).toEqual([mine.payment.id])
      expect((await fetch('/api/payments')).status).toBe(401)
    })

    it('resumes with the open session, or a fresh one once expired, but never when paid', async () => {
      const user = await registerUser('Ivy', 'ivy@example.com')
      const other = await registerUser('Jon', 'jon@example.com')
      const { payment, url } = await pay(user.cookie, { items: ticketItems })
      const resume = (cookie: string, id: string) => fetch('/api/payments/resume', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: id }),
      })

      const open = await resume(user.cookie, payment.id)
      expect(await open.json()).toEqual({ url })
      expect((await resume(other.cookie, payment.id)).status).toBe(404)

      const oldSession = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId
      await $fetch('/api/test/expire-session', { method: 'POST', body: { id: oldSession } })
      const fresh = await (await resume(user.cookie, payment.id)).json() as { url: string }
      expect(fresh.url).not.toBe(url)
      const newSession = (await rows()).find(row => row.id === payment.id)!.checkoutSessionId
      expect(newSession).not.toBe(oldSession)

      await sendEvent('resume_paid', 'checkout.session.completed', { id: newSession, payment_status: 'paid', payment_intent: 'pi_ivy' })
      expect((await resume(user.cookie, payment.id)).status).toBe(409)
    })
  })
})
