import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildShiftBroadcastEmail, buildShiftBroadcastSms } from '../../src/runtime/server/reminder-email'
import { shiftsNotify } from '../../src/runtime/server/utils/shifts-notify'

// Without `@frigear-nu/push` the send helper is what shifts always did: `dispatchEmailNotification` and
// `dispatchSMSNotification`, the email as built (with `to`) and the text only when one was built. `#shifts/push` is the stand-in
// a build generates then (`notifyUser` is `undefined`).
vi.mock('#shifts/push', () => ({ notifyUser: undefined, pushAvailable: false }))

const dispatchEmail = vi.fn()
const dispatchSms = vi.fn()
vi.stubGlobal('dispatchEmailNotification', dispatchEmail)
vi.stubGlobal('dispatchSMSNotification', dispatchSms)

const email = buildShiftBroadcastEmail({ email: 'ann@example.com', name: 'Ann', subject: 'Bring a jacket', message: 'It rains.', locale: 'en' })!
const sms = buildShiftBroadcastSms({ phone: '+4512345678', subject: 'Bring a jacket', message: 'It rains.' })!

beforeEach(() => {
  vi.resetAllMocks()
  dispatchEmail.mockResolvedValue(undefined)
  dispatchSms.mockResolvedValue(undefined)
})

describe('shiftsNotify without push', () => {
  it('dispatches the email as built, and the text when there is one', async () => {
    const result = await shiftsNotify(undefined, 7, { topic: 'shifts.broadcast', email, sms, push: { title: 'ignored', body: 'ignored' }, label: 'x' })
    expect(result).toEqual({ channels: ['email', 'sms'], failed: [] })
    expect(dispatchEmail).toHaveBeenCalledWith(email)
    expect(dispatchEmail.mock.calls[0]![0]).toMatchObject({ to: 'ann@example.com', template: { name: 'shifts-broadcast' }, meta: { shiftBroadcast: true } })
    expect(dispatchSms).toHaveBeenCalledWith(sms)
  })

  it('sends no text when none was built (SMS was not asked for)', async () => {
    expect(await shiftsNotify(undefined, 7, { topic: 'shifts.broadcast', email, sms: null, label: 'x' })).toEqual({ channels: ['email'], failed: [] })
    expect(dispatchSms).not.toHaveBeenCalled()
  })

  it('keeps going after a failed email, logs it, and says which channel failed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    dispatchEmail.mockRejectedValueOnce(new Error('smtp down'))
    expect(await shiftsNotify(undefined, 7, { topic: 'shifts.broadcast', email, sms, label: 'the broadcast shb_1 to user 7' })).toEqual({ channels: ['sms'], failed: ['email'] })
    expect(error).toHaveBeenCalledWith('[shifts] the broadcast shb_1 to user 7 could not be emailed', expect.any(Error))
    error.mockRestore()
  })

  it('does nothing for a person without an address or number', async () => {
    expect(await shiftsNotify(undefined, 7, { topic: 'shifts.swap', email: null, sms: null, label: 'x' })).toEqual({ channels: [], failed: [] })
    expect(dispatchEmail).not.toHaveBeenCalled()
  })
})
