import { createError, getRequestHeader } from 'h3'
import { defineInboxChannel } from '../../../../../src/runtime/utils'
import { testSent } from '../utils/test-state'

// A channel a module would ship: `send` records the reply (and fails on "FAIL" in the body); `inbound` parses the body
// the inbox read for it, checked with a shared token header against its `inboundSecret` (`FAKE_WEBHOOK` in the
// fixture's secrets).
export default defineInboxChannel({
  id: 'test.fake',
  inboundSecret: 'FAKE_WEBHOOK',
  async inbound(event, { secret, rawBody }) {
    if (getRequestHeader(event, 'x-fake-token') !== secret) throw createError({ statusCode: 401, statusMessage: 'Bad token' })
    const body = JSON.parse(rawBody) as { to: string, from: string, name?: string, id: string, text: string }
    return [{ address: body.to, contact: { externalId: body.from, name: body.name ?? null }, externalId: body.id, body: body.text, subject: 'Fake channel' }]
  },
  async send({ thread, contact, message, secret }) {
    if (message.body.includes('FAIL')) throw new Error('the fake provider is down')
    testSent.push({ threadId: thread.id, to: contact.externalId, body: message.body, secret })
    return { externalId: `fake-${testSent.length}` }
  },
})
