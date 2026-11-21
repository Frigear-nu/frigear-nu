import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { NotificationChannel, NotifyUserInput, NotifyUserResult } from '../../../types'

/**
 * Notifies one user on the channels they chose for `input.topic`: email through `dispatchEmailNotification`, SMS
 * through `dispatchSMSNotification` (only when the app has a `users.phone` column and the user has a number) and
 * push through `sendPush`. A channel goes out when the topic offers it, the user's choice (or the topic's default)
 * has it on, there is content for it and the user can be reached on it.
 *
 * An error on one channel is logged and does not stop the others or throw; the result says which channels went out
 * and why the others did not. An unknown topic throws: register it with `extendNotificationTopics`.
 */
export async function notifyUser(event: H3Event | undefined, userId: number, input: NotifyUserInput): Promise<NotifyUserResult> {
  const topic = findPushTopic(input.topic)
  if (!topic) {
    throw new Error(`[@frigear-nu/push] Unknown notification topic "${input.topic}". Register it with extendNotificationTopics(nuxt, [{ id, defaults }]).`)
  }

  const result: NotifyUserResult = { channels: [], skipped: {} }
  const [user] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  const settings = await pushChannelSettingsFor(userId, topic)
  const offered = topic.channels ?? ['email', 'sms', 'push']

  const run = async (channel: NotificationChannel, hasContent: boolean, send: () => Promise<boolean>) => {
    if (!offered.includes(channel) || !settings[channel]) {
      result.skipped[channel] = 'disabled'
      return
    }
    if (!hasContent) {
      result.skipped[channel] = 'no_content'
      return
    }
    try {
      if (await send()) result.channels.push(channel)
      else result.skipped[channel] = 'unavailable'
    }
    catch (error) {
      console.error(`[@frigear-nu/push] notifyUser: the ${channel} channel failed for user ${userId} (${topic.id}):`, error)
      result.skipped[channel] = 'failed'
    }
  }

  await run('email', !!input.email, async () => {
    if (!user?.email || !input.email) return false
    const { subject, body, text, replyTo, template, meta } = input.email
    await dispatchEmailNotification({
      to: user.email,
      subject,
      body,
      ...(text !== undefined ? { text } : {}),
      ...(replyTo !== undefined ? { replyTo } : {}),
      ...(template !== undefined ? { template } : {}),
      ...(meta !== undefined ? { meta } : {}),
    })
    return true
  })

  await run('sms', !!input.sms, async () => {
    const phone = await pushUserPhone(userId)
    if (!phone || !input.sms) return false
    await dispatchSMSNotification({ to: phone, body: input.sms.body })
    return true
  })

  await run('push', !!input.push, async () => {
    if (!input.push) return false
    const { sent } = await sendPush(event, { userIds: [userId], ...input.push })
    return sent > 0
  })

  return result
}
