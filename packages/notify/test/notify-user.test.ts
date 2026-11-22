import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationChoices, NotifyChoicesStore, NotifyRecipient, NotifyRecipientStore } from '../src/types'

// `#notify/topics` and `#notify/stores` are generated at build time; here they are stubs the tests change.
const state = vi.hoisted(() => ({
  recipientStore: null as NotifyRecipientStore | null,
  choicesStore: null as NotifyChoicesStore | null,
}))
const dispatch = vi.hoisted(() => ({
  dispatchEmailNotification: vi.fn(),
  dispatchSMSNotification: vi.fn(),
  dispatchPushNotification: vi.fn(),
}))
vi.mock('#notify/topics', () => ({
  topics: [
    { id: 'shifts.reminder', label: 'Shift reminders', defaults: { email: true, sms: false, push: true }, channels: ['email', 'sms', 'push'] },
    { id: 'broadcast', label: 'Broadcasts', defaults: { email: true, sms: false, push: false }, channels: ['email', 'push'] },
  ],
}))
vi.mock('#notify/stores', () => ({
  get recipientStore() {
    return state.recipientStore
  },
  get choicesStore() {
    return state.choicesStore
  },
}))
vi.mock('../src/runtime/server/utils/dispatch', () => dispatch)

const { notifyUser, readNotificationChannels, saveNotificationChannels } = await import('../src/runtime/server/utils/notify-user')

// The warnings are once per module instance: a fresh import makes a test that counts them independent of test order.
async function freshNotifyUser() {
  vi.resetModules()
  return (await import('../src/runtime/server/utils/notify-user')).notifyUser
}

function recipients(map: Record<number, NotifyRecipient>): NotifyRecipientStore {
  return { findRecipient: async userId => map[userId] ?? null }
}

function memoryChoices(initial: Record<number, NotificationChoices> = {}) {
  const data = structuredClone(initial)
  const store: NotifyChoicesStore = {
    readChoices: async userId => structuredClone(data[userId] ?? {}),
    // Merges per channel, as the store contract asks.
    writeChoices: async (userId, choices) => {
      const current = data[userId] ?? {}
      data[userId] = { ...current, ...Object.fromEntries(Object.entries(choices).map(([id, channels]) => [id, { ...current[id], ...channels }])) }
    },
  }
  return { store, data }
}

const content = {
  email: { subject: 'Shift tomorrow', body: '<p>Shift tomorrow</p>', template: { name: 'shifts-reminder', props: { a: 1 } } },
  sms: { body: { da: 'Vagt i morgen', en: 'Shift tomorrow' } },
  push: { title: 'Shift tomorrow', body: 'At 9' },
}

beforeEach(() => {
  state.recipientStore = recipients({ 1: { email: 'a@example.com', phone: '+4512345678', locale: 'da' }, 2: { email: 'b@example.com' } })
  state.choicesStore = memoryChoices().store
  dispatch.dispatchPushNotification.mockResolvedValue({ sent: 1, failed: 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const fn of Object.values(dispatch)) fn.mockReset()
})

describe('notifyUser', () => {
  it('sends on the channels the defaults allow and skips the ones that are off', async () => {
    const result = await notifyUser(1, { topic: 'shifts.reminder', ...content })
    expect(result).toEqual({ channels: ['email', 'push'], skipped: { sms: 'disabled' } })
    // The recipient's locale fills in the template's.
    expect(dispatch.dispatchEmailNotification).toHaveBeenCalledWith({ ...content.email, to: 'a@example.com', template: { ...content.email.template, locale: 'da' } })
    expect(dispatch.dispatchPushNotification).toHaveBeenCalledWith({ userIds: [1], ...content.push })
    expect(dispatch.dispatchSMSNotification).not.toHaveBeenCalled()
  })

  it('honours the user\'s choices and picks the SMS text of their locale', async () => {
    state.choicesStore = memoryChoices({ 1: { 'shifts.reminder': { email: false, sms: true } } }).store
    const result = await notifyUser(1, { topic: 'shifts.reminder', ...content })
    expect(result).toEqual({ channels: ['sms', 'push'], skipped: { email: 'disabled' } })
    expect(dispatch.dispatchSMSNotification).toHaveBeenCalledWith({ to: '+4512345678', body: 'Vagt i morgen' })
  })

  it('says why a channel did not go out: no address, no content, a push nobody took, a failure', async () => {
    state.choicesStore = memoryChoices({ 2: { 'shifts.reminder': { sms: true } } }).store
    dispatch.dispatchPushNotification.mockResolvedValue({ sent: 0, failed: 0 })
    expect(await notifyUser(2, { topic: 'shifts.reminder', push: content.push, sms: { body: 'x' } }))
      .toEqual({ channels: [], skipped: { email: 'no_content', sms: 'unavailable', push: 'unavailable' } })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    dispatch.dispatchEmailNotification.mockRejectedValue(new Error('provider down'))
    dispatch.dispatchPushNotification.mockResolvedValue(undefined)
    expect(await notifyUser(1, { topic: 'shifts.reminder', ...content }))
      .toEqual({ channels: ['push'], skipped: { email: 'failed', sms: 'disabled' } })
  })

  it('reaches nobody for an unknown user and refuses an unknown topic', async () => {
    expect(await notifyUser(99, { topic: 'shifts.reminder', ...content })).toEqual({ channels: [], skipped: { email: 'unavailable', sms: 'disabled', push: 'unavailable' } })
    await expect(notifyUser(1, { topic: 'nope', ...content })).rejects.toThrow(/Unknown notification topic "nope"/)
  })

  it('sends nothing and warns once without a recipient store', async () => {
    const notify = await freshNotifyUser()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.recipientStore = null
    expect(await notify(1, { topic: 'broadcast', ...content })).toEqual({ channels: [], skipped: { email: 'unavailable', push: 'unavailable' } })
    expect(await notify(2, { topic: 'broadcast', ...content })).toEqual({ channels: [], skipped: { email: 'unavailable', push: 'unavailable' } })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/No recipient store/))
    for (const fn of Object.values(dispatch)) expect(fn).not.toHaveBeenCalled()
  })

  it('applies the topic defaults without a choices store, and warns once', async () => {
    const notify = await freshNotifyUser()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    state.choicesStore = null
    expect(await notify(1, { topic: 'broadcast', ...content })).toEqual({ channels: ['email'], skipped: { sms: 'disabled', push: 'disabled' } })
    expect(await notify(2, { topic: 'broadcast', ...content })).toEqual({ channels: ['email'], skipped: { sms: 'disabled', push: 'disabled' } })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/No choices store/))
  })

  it('throws and sends nothing when reading the choices fails', async () => {
    state.choicesStore = { readChoices: () => Promise.reject(new Error('D1 down')), writeChoices: async () => {} }
    await expect(notifyUser(1, { topic: 'shifts.reminder', ...content })).rejects.toThrow('D1 down')
    for (const fn of Object.values(dispatch)) expect(fn).not.toHaveBeenCalled()
  })

  it('throws when looking up the recipient fails', async () => {
    state.recipientStore = { findRecipient: () => Promise.reject(new Error('D1 down')) }
    await expect(notifyUser(1, { topic: 'shifts.reminder', ...content })).rejects.toThrow('D1 down')
    for (const fn of Object.values(dispatch)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('the channels of a user', () => {
  it('lists every topic with its defaults, and whether SMS can work', async () => {
    expect(await readNotificationChannels(2)).toMatchObject({
      hasPhone: false,
      topics: [
        { id: 'shifts.reminder', channels: ['email', 'sms', 'push'], settings: { email: true, sms: false, push: true }, custom: false },
        { id: 'broadcast', channels: ['email', 'push'], settings: { email: true, sms: false, push: false }, custom: false },
      ],
    })
    expect((await readNotificationChannels(1)).hasPhone).toBe(true)
  })

  it('passes on only the channels set, ignoring unknown topics and channels a topic does not offer', async () => {
    const { store, data } = memoryChoices()
    state.choicesStore = store
    await saveNotificationChannels(1, { 'shifts.reminder': { sms: true }, 'broadcast': { sms: true, push: true }, 'nope': { email: false } })
    // Only the channels set (and offered) are passed on; the others keep following the defaults.
    expect(data[1]).toEqual({
      'shifts.reminder': { sms: true },
      'broadcast': { push: true },
    })
    expect((await readNotificationChannels(1)).topics.map(row => row.custom)).toEqual([true, true])
  })

  it('keeps two changes to different channels of a topic made one after the other', async () => {
    const { store, data } = memoryChoices()
    state.choicesStore = store
    await Promise.all([
      saveNotificationChannels(1, { 'shifts.reminder': { sms: true } }),
      saveNotificationChannels(1, { 'shifts.reminder': { push: false } }),
    ])
    expect(data[1]).toEqual({ 'shifts.reminder': { sms: true, push: false } })
    expect((await readNotificationChannels(1)).topics[0]!.settings).toEqual({ email: true, sms: true, push: false })
  })

  it('cannot store choices without a choices store', async () => {
    state.choicesStore = null
    await expect(saveNotificationChannels(1, { broadcast: { push: true } })).rejects.toThrow(/No choices store/)
  })
})
