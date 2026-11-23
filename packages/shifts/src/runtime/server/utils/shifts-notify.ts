import type { H3Event } from 'h3'
import type { EmailNotification, SMSNotification } from '@frigear-nu/notify/types'
import type { ShiftChannel } from '../../../types'
import type { ShiftsTopic } from '../../notifications'

/** What `shiftsNotify` sends one person: the messages as built, and the topic they belong to. */
export type ShiftsNotification = {
  topic: ShiftsTopic
  /** The email as built (its `to` is not used: `notifyUser` sends to the user's own address). `null` or left out: none. */
  email?: EmailNotification | null
  /**
   * The text as built. Leave it out when SMS was not asked for (`reminders.sms`, the broadcast's `sms` channel): the
   * person's own choice for the topic decides on top of that.
   */
  sms?: SMSNotification | null
  /** What the push notification says. Left out, it is the email's subject and message. */
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
 * Sends a notification to one person through notify's `notifyUser`: the channels the person chose for the topic (email
 * and push by default, SMS only when they turned it on) and have an address, number or device for. Never throws: a
 * failure is logged and leaves the channel out of the answer. `event` is `undefined` in the reminder task.
 */
export async function shiftsNotify(_event: H3Event | undefined, userId: number, notification: ShiftsNotification): Promise<ShiftsNotifyResult> {
  const { topic, email, sms, label } = notification
  const push = notification.push ?? (email ? shiftsPushFromEmail(email) : undefined)
  try {
    const result = await notifyUser(userId, {
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
