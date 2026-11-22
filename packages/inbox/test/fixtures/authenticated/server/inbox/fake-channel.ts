import { createError, getRequestHeader, readBody } from 'h3'
import { defineInboxChannel } from '../../../../../src/runtime/utils'
import { testSent } from '../utils/test-state'

// A channel a module would ship: `send` records the reply (and fails on "FAIL" in the body); `inbound` reads its own
// webhook, checked with a shared token header against its `inboundSecret` (`FAKE_WEBHOOK` in the fixture's secrets).
export default defineInboxChannel({
  id: 'test.fake',
  inboundSecret: 'FAKE_WEBHOOK',
  async inbound(event, { secret }) {
    if (getRequestHeader(event, 'x-fake-token') !== secret) throw createError({ statusCode: 401, statusMessage: 'Bad token' })
    const body = await readBody<{ to: string, from: string, name?: string, id: string, text: string }>(event)
    return [{ address: body.to, contact: { externalId: body.from, name: body.name ?? null }, externalId: body.id, body: body.text, subject: 'Fake channel' }]
  },
  async send({ thread, contact, message, secret }) {
    if (message.body.includes('FAIL')) throw new Error('the fake provider is down')
    testSent.push({ threadId: thread.id, to: contact.externalId, body: message.body, secret })
    return { externalId: `fake-${testSent.length}` }
  },
})
