import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import {
  extendNotificationTopics,
  notifyBuildState,
  readTranslated,
  resolveChannelSettings,
  setNotifyChoicesStore,
  setNotifyRecipientStore,
  storesTemplate,
  topicChannels,
} from '../src/runtime/utils/topics'
import type { NotificationTopic } from '../src/types'

const fakeNuxt = () => ({ options: {} }) as unknown as Nuxt

const reminder: NotificationTopic = { id: 'shifts.reminder', label: 'Shift reminders', defaults: { email: true, sms: false, push: true } }

describe('extendNotificationTopics', () => {
  it('collects topics from several modules, offering all channels by default', () => {
    const nuxt = fakeNuxt()
    extendNotificationTopics(nuxt, reminder)
    extendNotificationTopics(nuxt, [{ id: 'broadcast', defaults: { email: true, sms: false, push: false }, channels: ['push', 'email'] }])
    expect(notifyBuildState(nuxt)._topics!.map(topic => [topic.id, topic.channels])).toEqual([
      ['shifts.reminder', ['email', 'sms', 'push']],
      ['broadcast', ['email', 'push']],
    ])
  })

  it('replaces a topic registered again under the same id', () => {
    const nuxt = fakeNuxt()
    extendNotificationTopics(nuxt, reminder)
    extendNotificationTopics(nuxt, { ...reminder, label: 'Reminders', defaults: { email: false, sms: false, push: true } })
    expect(notifyBuildState(nuxt)._topics).toHaveLength(1)
    expect(notifyBuildState(nuxt)._topics![0]).toMatchObject({ label: 'Reminders', defaults: { email: false } })
  })

  it('refuses a malformed or too long id, an unknown channel and missing defaults at build time', () => {
    expect(() => extendNotificationTopics(fakeNuxt(), { ...reminder, id: 'Shifts Reminder' })).toThrow(/lower case words/)
    expect(() => extendNotificationTopics(fakeNuxt(), { ...reminder, id: `a${'b'.repeat(100)}` })).toThrow(/at most 100/)
    expect(() => extendNotificationTopics(fakeNuxt(), { ...reminder, channels: ['fax' as 'sms'] })).toThrow(/unknown channel "fax"/)
    expect(() => extendNotificationTopics(fakeNuxt(), { id: 'x', defaults: { email: true } as NotificationTopic['defaults'] })).toThrow(/defaults\.sms/)
  })
})

describe('the stores', () => {
  it('keeps the first registration of each store', () => {
    const nuxt = fakeNuxt()
    setNotifyRecipientStore(nuxt, '/users/store')
    setNotifyRecipientStore(nuxt, '/other/store')
    setNotifyChoicesStore(nuxt, '/preferences/store')
    expect(notifyBuildState(nuxt)).toMatchObject({ _recipientStore: '/users/store', _choicesStore: '/preferences/store' })
  })

  it('generates null for a store nobody registered', () => {
    expect(storesTemplate({})).toBe('export const recipientStore = null\nexport const choicesStore = null\n')
    expect(storesTemplate({ recipient: '/a' })).toContain('export { default as recipientStore } from "/a"')
  })
})

describe('resolveChannelSettings', () => {
  it('uses the defaults until the user chose, then the choice', () => {
    expect(resolveChannelSettings(reminder)).toEqual({ email: true, sms: false, push: true })
    expect(resolveChannelSettings(reminder, { email: false, sms: false, push: true })).toEqual({ email: false, sms: false, push: true })
    expect(resolveChannelSettings(reminder, { sms: true })).toEqual({ email: true, sms: true, push: true })
  })

  it('keeps a channel the topic does not offer off, whatever was stored', () => {
    const topic: NotificationTopic = { id: 'broadcast', defaults: { email: true, sms: true, push: true }, channels: ['email'] }
    expect(topicChannels(topic)).toEqual(['email'])
    expect(resolveChannelSettings(topic, { email: true, sms: true, push: true })).toEqual({ email: true, sms: false, push: false })
  })
})

describe('readTranslated', () => {
  it('prefers the locale, then its language, then English, then the first entry', () => {
    expect(readTranslated({ da: 'Hej', en: 'Hello' }, 'da')).toBe('Hej')
    expect(readTranslated({ da: 'Hej', en: 'Hello' }, 'sv')).toBe('Hello')
    expect(readTranslated({ da: 'Hej' }, 'en')).toBe('Hej')
    expect(readTranslated({ da: 'Hej', en: 'Hello' }, 'da-DK')).toBe('Hej')
    expect(readTranslated({ da: 'Hej', en: 'Hello' }, 'sv_SE')).toBe('Hello')
    expect(readTranslated('Same', 'da')).toBe('Same')
    expect(readTranslated(undefined, 'da')).toBe('')
  })
})
