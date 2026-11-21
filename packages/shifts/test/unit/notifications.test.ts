import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendNotificationTopics, resolveChannelSettings } from '@frigear-nu/push/utils'
import { SHIFTS_TOPICS, shiftsNotificationTopics } from '../../src/runtime/notifications'

type Topic = { id: string, channels?: string[], defaults: Record<string, boolean>, label?: unknown }
const register = () => {
  const nuxt = { options: {} } as unknown as Nuxt & { options: { push?: { _topics?: Topic[] } } }
  extendNotificationTopics(nuxt, shiftsNotificationTopics)
  return nuxt.options.push?._topics ?? []
}

describe('the shifts notification topics', () => {
  it('register with push: reminders, swaps and broadcasts', () => {
    expect(register().map(topic => topic.id)).toEqual(['shifts.reminder', 'shifts.swap', 'shifts.broadcast'])
    expect(Object.values(SHIFTS_TOPICS)).toEqual(['shifts.reminder', 'shifts.swap', 'shifts.broadcast'])
  })

  it('default to email and push, and offer SMS on reminders and broadcasts only', () => {
    const topics = Object.fromEntries(register().map(topic => [topic.id, topic]))
    for (const topic of Object.values(topics)) expect(topic.defaults).toEqual({ email: true, sms: false, push: true })
    expect(topics['shifts.reminder']!.channels).toEqual(['email', 'sms', 'push'])
    expect(topics['shifts.broadcast']!.channels).toEqual(['email', 'sms', 'push'])
    expect(topics['shifts.swap']!.channels).toEqual(['email', 'push'])
    // A person who never chose gets email and push; SMS stays off until they turn it on, and swaps never offer it.
    expect(resolveChannelSettings(topics['shifts.reminder']!)).toEqual({ email: true, sms: false, push: true })
    expect(resolveChannelSettings(topics['shifts.swap']!, { sms: true })).toEqual({ email: true, sms: false, push: true })
    expect(resolveChannelSettings(topics['shifts.broadcast']!, { sms: true })).toEqual({ email: true, sms: true, push: true })
  })

  it('have a Danish and an English label', () => {
    for (const topic of register()) expect(topic.label).toEqual({ da: expect.any(String), en: expect.any(String) })
  })
})
