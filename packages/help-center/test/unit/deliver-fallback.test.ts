import { beforeEach, describe, expect, it, vi } from 'vitest'
import { helpCenterDeliver } from '../../src/runtime/server/utils/help-center-deliver'
import type { HelpDelivery } from '../../src/runtime/server/utils/help-center-deliver'

// Without `@frigear-nu/push` a send is what the help center always did: the email through `dispatchEmailNotification` (with
// `to`), the text through `dispatchSMSNotification`.
const optional = vi.hoisted(() => ({
  dispatchEmailNotification: vi.fn(),
  dispatchSMSNotification: vi.fn(),
}))
vi.mock('#help-center/optional', () => ({ ...optional, notifyAvailable: true, notifyUser: undefined, pushAvailable: false }))

const message = { subject: 'Handbook', body: '<p>Ann</p>', text: 'Ann', template: { name: 'help-center-articles', props: { name: 'Ann' }, locale: 'en' }, meta: { helpCenter: { articleIds: ['a1'] } } }
const delivery = (overrides: Partial<HelpDelivery> = {}): HelpDelivery => ({
  userId: 7,
  email: true,
  sms: true,
  to: 'ann@example.com',
  phone: '+4512345678',
  message,
  smsBody: 'Handbook: https://example.com/h',
  push: { title: 'Handbook', body: 'Handbook' },
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  optional.dispatchEmailNotification.mockResolvedValue(undefined)
  optional.dispatchSMSNotification.mockResolvedValue(undefined)
})

describe('helpCenterDeliver without push', () => {
  it('dispatches the email with its address and the text, and never reports a push', async () => {
    expect(await helpCenterDeliver(undefined, delivery())).toEqual({ emailed: true, texted: true, pushed: false })
    expect(optional.dispatchEmailNotification).toHaveBeenCalledWith({ to: 'ann@example.com', ...message })
    expect(optional.dispatchSMSNotification).toHaveBeenCalledWith({ to: '+4512345678', body: 'Handbook: https://example.com/h' })
  })

  it('sends only what the sender chose and the person can receive', async () => {
    expect(await helpCenterDeliver(undefined, delivery({ sms: false }))).toEqual({ emailed: true, texted: false, pushed: false })
    expect(await helpCenterDeliver(undefined, delivery({ email: false }))).toEqual({ emailed: false, texted: true, pushed: false })
    expect(await helpCenterDeliver(undefined, delivery({ to: null, phone: null }))).toEqual({ emailed: false, texted: false, pushed: false })
  })

  it('throws when a send fails, for the caller to count the person as skipped', async () => {
    optional.dispatchEmailNotification.mockRejectedValue(new Error('smtp down'))
    await expect(helpCenterDeliver(undefined, delivery())).rejects.toThrow('smtp down')
  })
})
