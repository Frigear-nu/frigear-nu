import type { H3Event } from 'h3'
import { HELP_CENTER_TOPICS } from '../../notifications'

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

/** The channels that went out for one person, and the ones that were tried and failed. */
export type HelpDelivered = { emailed: boolean, texted: boolean, pushed: boolean, failed: Array<'email' | 'sms' | 'push'> }

/**
 * Sends one person their articles through notify's `notifyUser` on the `help-center.send` topic: the channels the sender
 * chose, as far as the person chose them for the topic and can be reached on them. A push goes with the email channel.
 * SMS is on the topic but off by default, so only people who turned it on get a text. Never throws: a failure is logged
 * and the attempted channels are reported as `failed`.
 */
export async function helpCenterDeliver(_event: H3Event | undefined, delivery: HelpDelivery): Promise<HelpDelivered> {
  const result: HelpDelivered = { emailed: false, texted: false, pushed: false, failed: [] }
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
    for (const channel of ['email', 'sms', 'push'] as const) if (sent.skipped[channel] === 'failed') result.failed.push(channel)
  }
  catch (error) {
    console.error(`[@frigear-nu/help-center] the articles could not be sent to user ${delivery.userId}`, error)
    result.failed.push(...(wantsEmail ? ['email' as const] : []), ...(wantsSms ? ['sms' as const] : []), ...(delivery.email ? ['push' as const] : []))
  }
  return result
}
