import { topics } from '#notify/topics'
import { choicesStore, recipientStore } from '#notify/stores'
import type {
  ChannelSettings,
  NotificationChannel,
  NotificationChannelsDto,
  NotificationChannelsRow,
  NotificationChoices,
  NotificationTopic,
  NotifyUserInput,
  NotifyUserResult,
} from '../../../types'
import { readTranslated, resolveChannelSettings, topicChannels } from '../../utils/topics'
import { dispatchEmailNotification, dispatchPushNotification, dispatchSMSNotification } from './dispatch'

const warned = new Set<string>()
function warnOnce(key: string, message: string) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[@frigear-nu/notify] ${message}`)
}

/** The topics modules registered with `extendNotificationTopics`. */
export const registeredNotificationTopics = (): readonly NotificationTopic[] => topics

export const findNotificationTopic = (id: string): NotificationTopic | undefined => topics.find(topic => topic.id === id)

async function readStoredChoices(userId: number) {
  if (!choicesStore) {
    warnOnce('choices', 'No choices store is registered (install @frigear-nu/preferences): every user gets the topics\' defaults.')
    return {}
  }
  return choicesStore.readChoices(userId)
}

/** Every registered topic with what applies to the user (their choice, or the topic's defaults). */
export async function readNotificationChannels(userId: number): Promise<NotificationChannelsDto> {
  const [choices, recipient] = await Promise.all([readStoredChoices(userId), recipientStore?.findRecipient(userId)])
  const rows: NotificationChannelsRow[] = topics.map(topic => ({
    id: topic.id,
    label: topic.label ?? topic.id,
    labelKey: topic.labelKey,
    description: topic.description,
    descriptionKey: topic.descriptionKey,
    channels: topicChannels(topic),
    settings: resolveChannelSettings(topic, choices[topic.id]),
    custom: topic.id in choices,
  }))
  return { hasPhone: !!recipient?.phone, topics: rows }
}

/**
 * Stores changes to the user's channels through the registered choices store. `changes` maps a topic id to the channels
 * to set; an unknown topic and a channel the topic does not offer are ignored. Only the channels given are passed on:
 * the store merges them per channel into what it has stored (read fresh), so two changes made at once to different
 * channels both stick, and channels never set keep following the topic's defaults. Throws when no choices store is
 * registered.
 */
export async function saveNotificationChannels(userId: number, changes: Record<string, Partial<ChannelSettings>>): Promise<void> {
  if (!choicesStore) throw new Error('[@frigear-nu/notify] No choices store is registered: install @frigear-nu/preferences to store notification choices.')
  const next: NotificationChoices = {}
  for (const [id, change] of Object.entries(changes)) {
    const topic = findNotificationTopic(id)
    if (!topic) continue
    const offered = topicChannels(topic)
    const allowed = Object.fromEntries(Object.entries(change).filter(([channel, value]) => offered.includes(channel as NotificationChannel) && typeof value === 'boolean'))
    if (Object.keys(allowed).length) next[id] = allowed
  }
  if (Object.keys(next).length) await choicesStore.writeChoices(userId, next)
}

/**
 * Notifies one user on the channels they chose for `input.topic`: email through `dispatchEmailNotification`, SMS through
 * `dispatchSMSNotification` and push through `dispatchPushNotification`. A channel goes out when the topic offers it, the
 * user's choice (or the topic's default) has it on, there is content for it and the user can be reached on it (an
 * address, a number; push asks notify's push driver).
 *
 * The contacts come from the registered recipient store (`@frigear-nu/users`) and the choices from the registered
 * choices store (`@frigear-nu/preferences`; without it the defaults apply). Without a recipient store nothing is sent and
 * a warning is logged. An error on one channel is logged and does not stop the others or throw; the result says which
 * channels went out and why the others did not.
 *
 * It throws for an unknown topic (register it with `extendNotificationTopics`) and when a store fails: an error from the
 * recipient store's `findRecipient` or the choices store's `readChoices` (a database error) rejects the call before any
 * channel is sent, so nothing goes out on defaults the user may have turned off. Callers in hooks and tasks catch and log
 * it so their own work goes on.
 */
export async function notifyUser(userId: number, input: NotifyUserInput): Promise<NotifyUserResult> {
  const topic = findNotificationTopic(input.topic)
  if (!topic) {
    throw new Error(`[@frigear-nu/notify] Unknown notification topic "${input.topic}". Register it with extendNotificationTopics(nuxt, [{ id, defaults }]).`)
  }

  const result: NotifyUserResult = { channels: [], skipped: {} }
  const offered = topicChannels(topic)
  const content: Record<NotificationChannel, boolean> = { email: !!input.email, sms: !!input.sms, push: !!input.push }

  if (!recipientStore) {
    warnOnce('recipient', 'No recipient store is registered (install @frigear-nu/users): notifyUser sends nothing.')
    for (const channel of offered) if (content[channel]) result.skipped[channel] = 'unavailable'
    return result
  }

  // A store error rejects the call: sending on the defaults could reach a user on a channel they turned off.
  const [recipient, choices] = await Promise.all([recipientStore.findRecipient(userId), readStoredChoices(userId)])
  const settings = resolveChannelSettings(topic, choices[topic.id])
  const locale = recipient?.locale || 'en'

  const run = async (channel: NotificationChannel, send: () => Promise<boolean>) => {
    if (!offered.includes(channel) || !settings[channel]) {
      result.skipped[channel] = 'disabled'
      return
    }
    if (!content[channel]) {
      result.skipped[channel] = 'no_content'
      return
    }
    if (!recipient) {
      result.skipped[channel] = 'unavailable'
      return
    }
    try {
      if (await send()) result.channels.push(channel)
      else result.skipped[channel] = 'unavailable'
    }
    catch (error) {
      console.error(`[@frigear-nu/notify] notifyUser: the ${channel} channel failed for user ${userId} (${topic.id}):`, error)
      result.skipped[channel] = 'failed'
    }
  }

  await run('email', async () => {
    if (!recipient?.email || !input.email) return false
    const { subject, body, text, replyTo, headers, template, meta } = input.email
    await dispatchEmailNotification({
      to: recipient.email,
      subject,
      body,
      ...(text !== undefined ? { text } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
      ...(headers !== undefined ? { headers } : {}),
      ...(template !== undefined ? { template: template.locale || !recipient.locale ? template : { ...template, locale: recipient.locale } } : {}),
      ...(meta !== undefined ? { meta } : {}),
    })
    return true
  })

  await run('sms', async () => {
    if (!recipient?.phone || !input.sms) return false
    await dispatchSMSNotification({ to: recipient.phone, body: readTranslated(input.sms.body, locale) })
    return true
  })

  await run('push', async () => {
    if (!input.push) return false
    const sent = await dispatchPushNotification({ userIds: [userId], ...input.push })
    // A driver that reports nothing (`log`) counts as sent.
    return sent === undefined || sent.sent > 0
  })

  return result
}
