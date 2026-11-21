import type { Nuxt } from '@nuxt/schema'
import type {} from '../../schema'
import type { ChannelSettings, NotificationChannel, NotificationTopic, Translated } from '../../types'

/** Every channel, in the order the matrix shows them. */
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['email', 'sms', 'push']

const TOPIC_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/

/** The channels a topic offers: its `channels`, or all three. */
export function topicChannels(topic: Pick<NotificationTopic, 'channels'>): NotificationChannel[] {
  return NOTIFICATION_CHANNELS.filter(channel => !topic.channels || topic.channels.includes(channel))
}

/**
 * What applies to a user for a topic: a channel the topic does not offer is off; otherwise the stored choice, or the
 * topic's default until the user chose.
 */
export function resolveChannelSettings(
  topic: Pick<NotificationTopic, 'defaults' | 'channels'>,
  stored?: Partial<ChannelSettings> | null,
): ChannelSettings {
  const result: ChannelSettings = { email: false, sms: false, push: false }
  for (const channel of topicChannels(topic)) result[channel] = stored?.[channel] ?? topic.defaults[channel] === true
  return result
}

/** A label, description or push text to show: the entry for `locale` (then its language, `da` for `da-DK`), then `en`, then the first one. */
export function readTranslated(value: Translated | undefined, locale: string): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? value[locale.split(/[-_]/)[0]!] ?? value.en ?? Object.values(value)[0] ?? ''
}

function validate(topic: NotificationTopic): NotificationTopic {
  if (!TOPIC_ID.test(topic.id)) {
    throw new Error(`[@frigear-nu/push] Notification topic id "${topic.id}" must be lower case words joined by "." "_" or "-" (for example "shifts.reminder").`)
  }
  for (const channel of topic.channels ?? []) {
    if (!NOTIFICATION_CHANNELS.includes(channel)) throw new Error(`[@frigear-nu/push] Notification topic "${topic.id}" offers an unknown channel "${channel}".`)
  }
  for (const channel of NOTIFICATION_CHANNELS) {
    if (typeof topic.defaults?.[channel] !== 'boolean') {
      throw new TypeError(`[@frigear-nu/push] Notification topic "${topic.id}" needs \`defaults.${channel}\` (true or false).`)
    }
  }
  return { ...topic, channels: topicChannels(topic) }
}

/**
 * Build-time API for modules to add rows to the notification channel matrix (the account page and the preferences
 * routes). Call it during a module's own `setup()`; order between modules does not matter. A topic registered again
 * under the same id replaces the earlier one. Unknown topics are refused by the routes and by `notifyUser`.
 *
 * ```ts
 * import { extendNotificationTopics } from '@frigear-nu/push/utils'
 *
 * extendNotificationTopics(nuxt, [{
 *   id: 'shifts.reminder',
 *   label: { da: 'Vagtpåmindelser', en: 'Shift reminders' },
 *   defaults: { email: true, sms: false, push: true },
 * }])
 * ```
 */
export function extendNotificationTopics(nuxt: Nuxt, topics: NotificationTopic | NotificationTopic[]): void {
  nuxt.options.push ||= {}
  const list = nuxt.options.push._topics ||= []
  for (const topic of (Array.isArray(topics) ? topics : [topics]).map(validate)) {
    const existing = list.findIndex(item => item.id === topic.id)
    if (existing === -1) list.push(topic)
    else list[existing] = topic
  }
}
