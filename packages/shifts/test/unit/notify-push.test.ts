import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildShiftReminderEmail, buildShiftReminderPush, buildShiftReminderSms } from '../../src/runtime/server/reminder-email'
import { shiftsNotify } from '../../src/runtime/server/utils/shifts-notify'

// With `@frigear-nu/push` installed the send helper goes through `notifyUser`: `#shifts/push` is the module a build generates,
// mocked here as the installed one. Nothing may reach `dispatchEmailNotification` or `dispatchSMSNotification` then.
const notifyUser = vi.hoisted(() => vi.fn())
vi.mock('#shifts/push', () => ({ notifyUser, pushAvailable: true }))

const dispatchEmail = vi.fn()
const dispatchSms = vi.fn()
vi.stubGlobal('dispatchEmailNotification', dispatchEmail)
vi.stubGlobal('dispatchSMSNotification', dispatchSms)

const variables = { name: 'Ann', team: 'Bar', when: 'Jun 28, 2027, 12:00', start: '2027-06-28T10:00:00.000Z' }
const left = { unit: 'hours', count: 2 } as const
const url = 'https://example.com/shifts/sha_1'

afterEach(() => {
  vi.clearAllMocks()
})

describe('shiftsNotify with push installed', () => {
  it('sends a reminder through notifyUser on the shifts.reminder topic: the email without `to`, the text, and a push', async () => {
    notifyUser.mockResolvedValue({ channels: ['email', 'push'], skipped: { sms: 'disabled' } })
    const email = buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, left, url, locale: 'en' })
    const sms = buildShiftReminderSms({ phone: '+4512345678', variables, offset: 120, left, url, locale: 'en' })
    const push = buildShiftReminderPush({ variables, left, url, locale: 'en' })

    const result = await shiftsNotify(undefined, 7, { topic: 'shifts.reminder', email, sms, push, label: 'the reminder of assignment sha_1' })

    expect(result).toEqual({ channels: ['email', 'push'], failed: [] })
    expect(notifyUser).toHaveBeenCalledTimes(1)
    const [event, userId, input] = notifyUser.mock.calls[0]!
    expect(event).toBeUndefined()
    expect(userId).toBe(7)
    expect(input.topic).toBe('shifts.reminder')
    // The email keeps its template and meta, and loses `to`: notifyUser sends it to the user's own address.
    expect(input.email).toMatchObject({ subject: email!.subject, template: { name: 'shifts-reminder', locale: 'en' }, meta: { shiftReminder: 120 } })
    expect(input.email).not.toHaveProperty('to')
    expect(input.sms).toEqual({ body: sms!.body })
    expect(input.push).toEqual({ title: email!.subject, body: expect.stringContaining('Bar'), url })
    expect(dispatchEmail).not.toHaveBeenCalled()
    expect(dispatchSms).not.toHaveBeenCalled()
  })

  it('sends no text unless one was built: the caller decides whether SMS was asked for', async () => {
    notifyUser.mockResolvedValue({ channels: ['email'], skipped: {} })
    const email = buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, left, url, locale: 'en' })
    await shiftsNotify(undefined, 7, { topic: 'shifts.reminder', email, sms: null, label: 'x' })
    expect(notifyUser.mock.calls[0]![2]).not.toHaveProperty('sms')
  })

  it('derives the push from the email when none is given, and sends one without an email', async () => {
    notifyUser.mockResolvedValue({ channels: ['push'], skipped: {} })
    const email = buildShiftReminderEmail({ email: 'ann@example.com', variables, offset: 120, left, url, locale: 'da' })
    await shiftsNotify(undefined, 7, { topic: 'shifts.swap', email, label: 'x' })
    expect(notifyUser.mock.calls[0]![2].push).toEqual({ title: email!.subject, body: expect.stringContaining('Bar'), url })

    notifyUser.mockClear()
    await shiftsNotify(undefined, 7, { topic: 'shifts.broadcast', email: null, push: { title: 'Hi', body: 'There' }, label: 'x' })
    expect(notifyUser.mock.calls[0]![2]).toEqual({ topic: 'shifts.broadcast', push: { title: 'Hi', body: 'There' } })
  })

  it('reports the channels notifyUser could not send, and never throws', async () => {
    notifyUser.mockResolvedValue({ channels: ['email'], skipped: { push: 'failed', sms: 'disabled' } })
    expect(await shiftsNotify(undefined, 7, { topic: 'shifts.broadcast', email: null, push: { title: 'A', body: 'B' }, label: 'x' })).toEqual({ channels: ['email'], failed: ['push'] })

    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    notifyUser.mockRejectedValue(new Error('unknown topic'))
    expect(await shiftsNotify(undefined, 7, { topic: 'shifts.swap', email: null, push: { title: 'A', body: 'B' }, label: 'the swap message' })).toEqual({ channels: [], failed: [] })
    expect(error).toHaveBeenCalledWith('[shifts] the swap message could not be sent', expect.any(Error))
    error.mockRestore()
  })
})
