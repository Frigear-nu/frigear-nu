import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendNotificationTopics, resolveChannelSettings } from '@frigear-nu/notify/utils'
import { HELP_CENTER_TOPICS, helpCenterNotificationTopics } from '../../src/runtime/notifications'

type Topic = { id: string, channels?: string[], defaults: Record<string, boolean>, label?: unknown }

describe('the help center notification topic', () => {
  const nuxt = { options: {} } as unknown as Nuxt & { options: { notify?: { _topics?: Topic[] } } }
  extendNotificationTopics(nuxt, helpCenterNotificationTopics)
  const topics = nuxt.options.notify?._topics ?? []

  it('registers help-center.send with notify', () => {
    expect(HELP_CENTER_TOPICS.send).toBe('help-center.send')
    expect(topics.map(topic => topic.id)).toEqual(['help-center.send'])
  })

  it('defaults to email and push, offers SMS off by default, and has Danish and English labels', () => {
    const [topic] = topics
    expect(topic!.defaults).toEqual({ email: true, sms: false, push: true })
    expect(topic!.channels).toEqual(['email', 'sms', 'push'])
    expect(resolveChannelSettings(topic!, {})).toEqual({ email: true, sms: false, push: true })
    expect(resolveChannelSettings(topic!, { sms: true })).toEqual({ email: true, sms: true, push: true })
    expect(topic!.label).toEqual({ da: expect.any(String), en: expect.any(String) })
  })
})
