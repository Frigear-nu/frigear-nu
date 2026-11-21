import type { H3Event } from 'h3'
import type { EmailNotification, SMSNotification } from '@frigear-nu/notify/types'
import { notifyUser, pushAvailable } from '#shifts/push'
import type { ShiftChannel } from '../../../types'
import type { ShiftsTopic } from '../../notifications'

/** What `shiftsNotify` sends one person: the messages as `dispatch*Notification` take them, and the topic they belong to. */
export type ShiftsNotification = {
  topic: ShiftsTopic
  /** The email as built today (with `to`). `null` or left out: the person has no address. */
  email?: EmailNotification | null
  /**
   * The text as built today (with `to`). Leave it out when SMS was not asked for (`reminders.sms`, the broadcast's `sms`
   * channel): with push installed the person's own choice for the topic decides on top of that.
   */
  sms?: SMSNotification | null
  /** What the push notification says. Left out, it is the email's subject and message. Only used when push is installed. */
  push?: { title: string, body: string, url?: string }
  /** What the notification is, for the log line of a failure ("the reminder of assignment sha_1"). */
  label: string
}

/** The channels that went out, and the ones that were tried and failed (a person who turned a channel off is neither). */
export type ShiftsNotifyResult = { channels: ShiftChannel[], failed: ShiftChannel[] }

/** The push notification of an email: its subject, the template's message (else the subject) and its link. */
export function shiftsPushFromEmail(email: EmailNotification): { title: string, body: string, url?: string } {
  const props = email.template?.props ?? {}
  const message = typeof props.message === 'string' && props.message ? props.message : email.subject
  const url = typeof props.url === 'string' && props.url ? props.url : undefined
  return { title: email.subject, body: message.length > 200 ? `${message.slice(0, 197)}...` : message, ...(url ? { url } : {}) }
}

/**
 * Sends a notification to one person. With `@frigear-nu/push` installed it goes through `notifyUser`: the channels the
 * person chose for the topic (email and push by default, SMS only when they turned it on) and have an address, number or
 * device for. Without push it is what shifts always did: the email, and the text when there is one, through
 * `dispatchEmailNotification` and `dispatchSMSNotification`. Never throws: a failure is logged and leaves the channel out
 * of the answer. `event` is `undefined` in the reminder task.
 */
export async function shiftsNotify(event: H3Event | undefined, userId: number, notification: ShiftsNotification): Promise<ShiftsNotifyResult> {
  const { topic, email, sms, label } = notification
  if (pushAvailable && notifyUser) {
    const push = notification.push ?? (email ? shiftsPushFromEmail(email) : undefined)
    try {
      const result = await notifyUser(event, userId, {
        topic,
        ...(email
          ? { email: { subject: email.subject, body: email.body, text: email.text, replyTo: email.replyTo, template: email.template, meta: email.meta as Record<string, unknown> | undefined } }
          : {}),
        ...(sms ? { sms: { body: sms.body } } : {}),
        push,
      })
      return { channels: result.channels, failed: (Object.keys(result.skipped) as ShiftChannel[]).filter(channel => result.skipped[channel] === 'failed') }
    }
    catch (error) {
      console.error(`[shifts] ${label} could not be sent`, error)
      // Nothing is known to have gone out: every channel that had content counts as failed.
      return { channels: [], failed: [email ? 'email' : undefined, sms ? 'sms' : undefined, push ? 'push' : undefined].filter((channel): channel is ShiftChannel => !!channel) }
    }
  }

  const channels: ShiftChannel[] = []
  const failed: ShiftChannel[] = []
  if (email) {
    await dispatchEmailNotification(email).then(() => channels.push('email')).catch((error: unknown) => {
      failed.push('email')
      console.error(`[shifts] ${label} could not be emailed`, error)
    })
  }
  if (sms) {
    await dispatchSMSNotification(sms).then(() => channels.push('sms')).catch((error: unknown) => {
      failed.push('sms')
      console.error(`[shifts] ${label} could not be texted`, error)
    })
  }
  return { channels, failed }
}
