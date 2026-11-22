import type { Nuxt } from '@nuxt/schema'
import type { ChannelSettings, NotificationChannel, NotificationTopic, NotifyBuildState, Translated } from '../../types'

/** Every channel, in the order the account page shows them. */
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['email', 'sms', 'push']

const TOPIC_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/

/** The longest topic id: choices are stored under it. */
export const NOTIFICATION_TOPIC_ID_MAX_LENGTH = 100

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

/** A label, description or text to show: the entry for `locale` (then its language, `da` for `da-DK`), then `en`, then the first one. */
export function readTranslated(value: Translated | undefined, locale: string): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? value[locale.split(/[-_]/)[0]!] ?? value.en ?? Object.values(value)[0] ?? ''
}

/** What other modules registered with notify during their `setup()`, kept on `nuxt.options.notify`. */
export function notifyBuildState(nuxt: Nuxt): NotifyBuildState {
  const options = nuxt.options as unknown as { notify?: NotifyBuildState }
  return options.notify ||= {}
}

function validate(topic: NotificationTopic): NotificationTopic {
  if (!TOPIC_ID.test(topic.id) || topic.id.length > NOTIFICATION_TOPIC_ID_MAX_LENGTH) {
    throw new Error(`[@frigear-nu/notify] Notification topic id "${topic.id}" must be lower case words joined by "." "_" or "-" (for example "shifts.reminder"), at most ${NOTIFICATION_TOPIC_ID_MAX_LENGTH} characters.`)
  }
  for (const channel of topic.channels ?? []) {
    if (!NOTIFICATION_CHANNELS.includes(channel)) throw new Error(`[@frigear-nu/notify] Notification topic "${topic.id}" offers an unknown channel "${channel}".`)
  }
  for (const channel of NOTIFICATION_CHANNELS) {
    if (typeof topic.defaults?.[channel] !== 'boolean') {
      throw new TypeError(`[@frigear-nu/notify] Notification topic "${topic.id}" needs \`defaults.${channel}\` (true or false).`)
    }
  }
  return { ...topic, channels: topicChannels(topic) }
}

/**
 * Build-time API for modules to declare the kinds of messages they send with `notifyUser`: one row each on the account
 * notifications page. Call it during a module's own `setup()`; order between modules does not matter. A topic registered
 * again under the same id replaces the earlier one. `notifyUser` refuses topics that are not registered.
 *
 * ```ts
 * import { extendNotificationTopics } from '@frigear-nu/notify/utils'
 *
 * extendNotificationTopics(nuxt, [{
 *   id: 'shifts.reminder',
 *   label: { da: 'Vagtpåmindelser', en: 'Shift reminders' },
 *   defaults: { email: true, sms: false, push: true },
 * }])
 * ```
 */
export function extendNotificationTopics(nuxt: Nuxt, topics: NotificationTopic | NotificationTopic[]): void {
  const list = notifyBuildState(nuxt)._topics ||= []
  for (const topic of (Array.isArray(topics) ? topics : [topics]).map(validate)) {
    const existing = list.findIndex(item => item.id === topic.id)
    if (existing === -1) list.push(topic)
    else list[existing] = topic
  }
}

/**
 * Registers where `notifyUser` finds a user's email, phone and locale: `path` is a module whose default export is a
 * `NotifyRecipientStore`. `@frigear-nu/users` registers one. The first registration wins.
 */
export function setNotifyRecipientStore(nuxt: Nuxt, path: string): void {
  notifyBuildState(nuxt)._recipientStore ||= path
}

/**
 * Registers where users' channel choices per topic are read and written: `path` is a module whose default export is a
 * `NotifyChoicesStore`. `@frigear-nu/preferences` registers one. The first registration wins.
 */
export function setNotifyChoicesStore(nuxt: Nuxt, path: string): void {
  notifyBuildState(nuxt)._choicesStore ||= path
}

/** The source of the server-side `#notify/topics`. */
export function topicsTemplate(topics: NotificationTopic[]): string {
  return `export const topics = ${JSON.stringify(topics, null, 2)}\n`
}

/** The source of the server-side `#notify/stores`: the registered stores, `null` where none is. */
export function storesTemplate(stores: { recipient?: string, choices?: string }): string {
  return [
    stores.recipient ? `export { default as recipientStore } from ${JSON.stringify(stores.recipient)}` : 'export const recipientStore = null',
    stores.choices ? `export { default as choicesStore } from ${JSON.stringify(stores.choices)}` : 'export const choicesStore = null',
    '',
  ].join('\n')
}
