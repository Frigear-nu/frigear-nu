import type { H3Event } from 'h3'
import { HELP_CENTER_TOPICS } from '../../notifications'
import type { HelpSendSkipReason } from '../../../types'

/** What goes to one person when articles are sent: the message as it is built, and where it may go. */
export type HelpDelivery = {
  userId: number
  /** The sender chose the email channel. */
  email: boolean
  /** The sender chose the SMS channel. */
  sms: boolean
  /** The person's address, or `null`. */
  to: string | null
  /** The person's phone number, or `null`. */
  phone: string | null
  message: { subject: string, body: string, text: string, template: { name: string, props?: Record<string, unknown>, locale?: string }, meta: Record<string, unknown> }
  /** The text of an SMS. */
  smsBody: string
  /** The push notification, sent with the email channel. */
  push: { title: string, body: string, url?: string }
}

/**
 * The channels that went out for one person, the ones that were tried and failed, and why notify left a channel out
 * (`notifyUser`'s `skipped`: `disabled` when the person's choice for the topic has it off, `unavailable` when they
 * cannot be reached on it).
 */
export type HelpDelivered = {
  emailed: boolean
  texted: boolean
  pushed: boolean
  failed: Array<'email' | 'sms' | 'push'>
  skipped: Partial<Record<'email' | 'sms' | 'push', string>>
}

/**
 * Sends one person their articles through notify's `notifyUser` on the `help-center.send` topic: the channels the sender
 * chose, as far as the person chose them for the topic and can be reached on them. A push goes with the email channel.
 * SMS is on the topic but off by default, so only people who turned it on get a text. Never throws: a failure is logged
 * and the attempted channels are reported as `failed`.
 */
export async function helpCenterDeliver(_event: H3Event | undefined, delivery: HelpDelivery): Promise<HelpDelivered> {
  const result: HelpDelivered = { emailed: false, texted: false, pushed: false, failed: [], skipped: {} }
  const wantsEmail = delivery.email && !!delivery.to
  const wantsSms = delivery.sms && !!delivery.phone
  if (!delivery.email && !wantsSms) return result
  try {
    const sent = await notifyUser(delivery.userId, {
      topic: HELP_CENTER_TOPICS.send,
      ...(wantsEmail ? { email: delivery.message } : {}),
      ...(wantsSms ? { sms: { body: delivery.smsBody } } : {}),
      // A push belongs with the email: a send by SMS alone has none.
      ...(delivery.email ? { push: delivery.push } : {}),
    })
    result.emailed = sent.channels.includes('email')
    result.texted = sent.channels.includes('sms')
    result.pushed = sent.channels.includes('push')
    result.skipped = { ...sent.skipped }
    for (const channel of ['email', 'sms', 'push'] as const) if (sent.skipped[channel] === 'failed') result.failed.push(channel)
  }
  catch (error) {
    console.error(`[@frigear-nu/help-center] the articles could not be sent to user ${delivery.userId}`, error)
    result.failed.push(...(wantsEmail ? ['email' as const] : []), ...(wantsSms ? ['sms' as const] : []), ...(delivery.email ? ['push' as const] : []))
  }
  return result
}

/**
 * Why a text did not go to a person: no number (`no_phone`), SMS off for them on `help-center.send` (`no_sms_consent`;
 * notify's rule: the topic offers SMS but it is off until the person turns it on), or the channel failed.
 */
export function helpSendSmsSkipReason(phone: string | null | undefined, delivered: HelpDelivered | null): HelpSendSkipReason {
  if (!phone || !delivered) return 'no_phone'
  if (delivered.failed.includes('sms') || delivered.skipped.sms === 'failed') return 'failed'
  if (delivered.skipped.sms === 'disabled') return 'no_sms_consent'
  return 'no_phone'
}

/** Why an email did not go to a person: no address (`no_email`), email off for them on `help-center.send` (`opted_out`), or a failure. */
export function helpSendEmailSkipReason(to: string | null | undefined, delivered: HelpDelivered | null): HelpSendSkipReason {
  if (!to || !delivered) return 'no_email'
  if (delivered.failed.includes('email') || delivered.skipped.email === 'failed') return 'failed'
  if (delivered.skipped.email === 'disabled') return 'opted_out'
  return 'no_email'
}
