import { fakeSessions } from '../../plugins/fake-stripe'

// Test-only: marks a fake Checkout session expired so `resumePayment` has to create a new one.
export default defineEventHandler(async (event) => {
  const { id } = await readBody<{ id: string }>(event)
  const session = fakeSessions.get(id)
  if (session) session.status = 'expired'
  return { ok: Boolean(session) }
})
