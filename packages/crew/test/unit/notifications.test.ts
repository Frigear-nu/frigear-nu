import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendNotificationTopics, resolveChannelSettings } from '@frigear-nu/notify/utils'
import { CREW_TOPICS, crewNotificationTopics } from '../../src/runtime/notifications'

type Topic = { id: string, channels?: string[], defaults: Record<string, boolean>, label?: unknown }

describe('the crew notification topic', () => {
  const nuxt = { options: {} } as unknown as Nuxt & { options: { notify?: { _topics?: Topic[] } } }
  extendNotificationTopics(nuxt, crewNotificationTopics)
  const topics = nuxt.options.notify?._topics ?? []

  it('registers crew.status with notify', () => {
    expect(CREW_TOPICS.status).toBe('crew.status')
    expect(topics.map(topic => topic.id)).toEqual(['crew.status'])
  })

  it('defaults to email and push, does not offer SMS, and has Danish and English labels', () => {
    const [topic] = topics
    expect(topic!.defaults).toEqual({ email: true, sms: false, push: true })
    expect(topic!.channels).toEqual(['email', 'push'])
    expect(resolveChannelSettings(topic!, { sms: true })).toEqual({ email: true, sms: false, push: true })
    expect(topic!.label).toEqual({ da: expect.any(String), en: expect.any(String) })
  })
})
