import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helpCenterDeliver } from '../../src/runtime/server/utils/help-center-deliver'
import type { HelpDelivery } from '../../src/runtime/server/utils/help-center-deliver'

// With `@frigear-nu/push` installed an email goes through `notifyUser` on the `help-center.send` topic, with a push. The
// topic does not offer SMS, so a text is still dispatched directly. `#help-center/optional` is the server module a build
// generates, mocked here as the one with push installed.
const optional = vi.hoisted(() => ({
  notifyUser: vi.fn(),
  dispatchEmailNotification: vi.fn(),
  dispatchSMSNotification: vi.fn(),
}))
vi.mock('#help-center/optional', () => ({ ...optional, notifyAvailable: true, pushAvailable: true }))

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

describe('helpCenterDeliver with push installed', () => {
  it('sends the email and a push through notifyUser, without `to`', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['email', 'push'], skipped: {} })
    expect(await helpCenterDeliver(undefined, delivery())).toEqual({ emailed: true, texted: false, pushed: true, failed: [] })
    expect(optional.notifyUser).toHaveBeenCalledWith(undefined, 7, { topic: 'help-center.send', email: message, push: { title: 'Handbook', body: 'Handbook', url: 'https://example.com/h' } })
    expect(optional.dispatchEmailNotification).not.toHaveBeenCalled()
    expect(optional.dispatchSMSNotification).not.toHaveBeenCalled()
  })

  it('reports nothing for a person who turned the channels off', async () => {
    optional.notifyUser.mockResolvedValue({ channels: [], skipped: { email: 'disabled', push: 'disabled' } })
    expect(await helpCenterDeliver(undefined, delivery())).toEqual({ emailed: false, texted: false, pushed: false, failed: [] })
  })

  it('reports email and push as failed when notifyUser throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    optional.notifyUser.mockRejectedValue(new Error('unknown topic'))
    expect(await helpCenterDeliver(undefined, delivery())).toEqual({ emailed: false, texted: false, pushed: false, failed: ['email', 'push'] })
    error.mockRestore()
  })

  it('texts directly when the sender chose SMS, whatever the person chose for the topic', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['email', 'push'], skipped: {} })
    expect(await helpCenterDeliver(undefined, delivery({ sms: true }))).toEqual({ emailed: true, texted: true, pushed: true, failed: [] })
    expect(optional.dispatchSMSNotification).toHaveBeenCalledWith({ to: '+4512345678', body: 'Handbook: https://example.com/h' })
  })

  it('does not use notifyUser for a send by SMS alone: a push belongs with the email', async () => {
    expect(await helpCenterDeliver(undefined, delivery({ email: false, sms: true }))).toEqual({ emailed: false, texted: true, pushed: false, failed: [] })
    expect(optional.notifyUser).not.toHaveBeenCalled()
  })

  it('sends the push alone to a person without an address', async () => {
    optional.notifyUser.mockResolvedValue({ channels: ['push'], skipped: { email: 'no_content' } })
    await helpCenterDeliver(undefined, delivery({ to: null }))
    expect(optional.notifyUser.mock.calls[0]![2]).toEqual({ topic: 'help-center.send', push: { title: 'Handbook', body: 'Handbook', url: 'https://example.com/h' } })
  })
})
