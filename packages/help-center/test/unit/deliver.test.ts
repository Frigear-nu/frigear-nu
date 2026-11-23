import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helpCenterDeliver, helpSendEmailSkipReason, helpSendSmsSkipReason } from '../../src/runtime/server/utils/help-center-deliver'
import type { HelpDelivered, HelpDelivery } from '../../src/runtime/server/utils/help-center-deliver'

// Every channel goes through notify's `notifyUser` on the `help-center.send` topic: the email with a push, and a text,
// which the person's choice for the topic decides (SMS is off by default). Never `dispatchSMSNotification` directly.
// They are notify's auto-imports, stubbed as globals here.
const optional = {
  notifyUser: vi.fn(),
  dispatchEmailNotification: vi.fn(),
  dispatchSMSNotification: vi.fn(),
}
for (const [name, fn] of Object.entries(optional)) vi.stubGlobal(name, fn)

const message = { subject: 'Handbook', body: '<p>Ann</p>', text: 'Ann', template: { name: 'help-center-articles', props: { name: 'Ann' }, locale: 'en' }, meta: { helpCenter: { articleIds: ['a1'] } } }
const delivery = (overrides: Partial<HelpDelivery> = {}): HelpDelivery => ({
  userId: 7,
  email: true,
  sms: false,
  to: 'ann@example.com',
  phone: '+4512345678',
  message,
  smsBody: 'Handbook: https://example.com/h',
  push: { title: 'Handbook', body: 'Handbook', url: 'https://example.com/h' },
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  optional.dispatchEmailNotification.mockResolvedValue(undefined)
  optional.dispatchSMSNotification.mockResolvedValue(undefined)
})

describe('helpCenterDeliver', () => {
  it('sends the email and a push through notifyUser, without `to`', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['email', 'push'], skipped: {} })
    expect(await helpCenterDeliver(undefined, delivery())).toEqual({ emailed: true, texted: false, pushed: true, failed: [], skipped: {} })
    expect(optional.notifyUser).toHaveBeenCalledWith(7, { topic: 'help-center.send', email: message, push: { title: 'Handbook', body: 'Handbook', url: 'https://example.com/h' } })
    expect(optional.dispatchEmailNotification).not.toHaveBeenCalled()
    expect(optional.dispatchSMSNotification).not.toHaveBeenCalled()
  })

  it('reports nothing for a person who turned the channels off', async () => {
    optional.notifyUser.mockResolvedValue({ channels: [], skipped: { email: 'disabled', push: 'disabled' } })
    expect(await helpCenterDeliver(undefined, delivery())).toEqual({ emailed: false, texted: false, pushed: false, failed: [], skipped: { email: 'disabled', push: 'disabled' } })
  })

  it('reports email and push as failed when notifyUser throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    optional.notifyUser.mockRejectedValue(new Error('unknown topic'))
    expect(await helpCenterDeliver(undefined, delivery())).toEqual({ emailed: false, texted: false, pushed: false, failed: ['email', 'push'], skipped: {} })
    error.mockRestore()
  })

  it('asks notifyUser for the text too, and reports it only when it went out (the person turned SMS on)', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['email', 'sms', 'push'], skipped: {} })
    expect(await helpCenterDeliver(undefined, delivery({ sms: true }))).toEqual({ emailed: true, texted: true, pushed: true, failed: [], skipped: {} })
    expect(optional.notifyUser).toHaveBeenCalledWith(7, {
      topic: 'help-center.send',
      email: message,
      sms: { body: 'Handbook: https://example.com/h' },
      push: { title: 'Handbook', body: 'Handbook', url: 'https://example.com/h' },
    })
    expect(optional.dispatchSMSNotification).not.toHaveBeenCalled()
  })

  it('texts nobody who left SMS off for the topic', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['email', 'push'], skipped: { sms: 'disabled' } })
    expect(await helpCenterDeliver(undefined, delivery({ sms: true }))).toEqual({ emailed: true, texted: false, pushed: true, failed: [], skipped: { sms: 'disabled' } })
    expect(optional.dispatchSMSNotification).not.toHaveBeenCalled()
  })

  it('sends by SMS alone without a push (a push belongs with the email)', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['sms'], skipped: {} })
    expect(await helpCenterDeliver(undefined, delivery({ email: false, sms: true }))).toEqual({ emailed: false, texted: true, pushed: false, failed: [], skipped: {} })
    expect(optional.notifyUser).toHaveBeenCalledWith(7, { topic: 'help-center.send', sms: { body: 'Handbook: https://example.com/h' } })
  })

  it('does not call notifyUser for a send by SMS to a person without a phone number', async () => {
    expect(await helpCenterDeliver(undefined, delivery({ email: false, sms: true, phone: null }))).toEqual({ emailed: false, texted: false, pushed: false, failed: [], skipped: {} })
    expect(optional.notifyUser).not.toHaveBeenCalled()
  })

  it('reports a failed text', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['email', 'push'], skipped: { sms: 'failed' } })
    expect(await helpCenterDeliver(undefined, delivery({ sms: true }))).toEqual({ emailed: true, texted: false, pushed: true, failed: ['sms'], skipped: { sms: 'failed' } })
  })

  it('sends the push alone to a person without an address', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['push'], skipped: { email: 'no_content' } })
    await helpCenterDeliver(undefined, delivery({ to: null }))
    expect(optional.notifyUser.mock.calls[0]![1]).toEqual({ topic: 'help-center.send', push: { title: 'Handbook', body: 'Handbook', url: 'https://example.com/h' } })
  })
})

describe('skip reasons', () => {
  const delivered = (overrides: Partial<HelpDelivered> = {}): HelpDelivered => ({ emailed: false, texted: false, pushed: false, failed: [], skipped: {}, ...overrides })

  it('names why a text did not go: no number, SMS off for the topic, or a failure', () => {
    expect(helpSendSmsSkipReason(null, null)).toBe('no_phone')
    expect(helpSendSmsSkipReason('+4512345678', delivered({ skipped: { sms: 'disabled' } }))).toBe('no_sms_consent')
    expect(helpSendSmsSkipReason('+4512345678', delivered({ skipped: { sms: 'unavailable' } }))).toBe('no_phone')
    expect(helpSendSmsSkipReason('+4512345678', delivered({ failed: ['sms'], skipped: { sms: 'failed' } }))).toBe('failed')
  })

  it('names why an email did not go: no address, email off for the topic, or a failure', () => {
    expect(helpSendEmailSkipReason(null, delivered())).toBe('no_email')
    expect(helpSendEmailSkipReason('ann@example.com', delivered({ skipped: { email: 'unavailable' } }))).toBe('no_email')
    expect(helpSendEmailSkipReason('ann@example.com', delivered({ skipped: { email: 'disabled' } }))).toBe('opted_out')
    expect(helpSendEmailSkipReason('ann@example.com', delivered({ failed: ['email', 'push'] }))).toBe('failed')
  })
})
