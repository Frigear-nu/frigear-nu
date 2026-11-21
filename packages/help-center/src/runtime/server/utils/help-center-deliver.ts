import type { H3Event } from 'h3'
import { dispatchEmailNotification, dispatchSMSNotification, notifyUser, pushAvailable } from '#help-center/optional'
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
  /** The push notification, used only with push installed and the email channel chosen. */
  push: { title: string, body: string, url?: string }
}

/** The channels that went out for one person. */
export type HelpDelivered = { emailed: boolean, texted: boolean, pushed: boolean }

/**
 * Sends one person their articles. With `@frigear-nu/push` installed the email goes through `notifyUser` on the
 * `help-center.send` topic, together with a push notification: the channels the person chose, as far as they can be
 * reached. The topic does not offer SMS, so a text is always sent directly (the sender asked for it). Without push it is
 * what the help center always did: the email through `dispatchEmailNotification`, the text through
 * `dispatchSMSNotification`. Throws when a send fails; the caller counts the person as skipped.
 */
export async function helpCenterDeliver(event: H3Event | undefined, delivery: HelpDelivery): Promise<HelpDelivered> {
  const result: HelpDelivered = { emailed: false, texted: false, pushed: false }
  const wantsEmail = delivery.email && !!delivery.to
  if (pushAvailable && notifyUser && delivery.email) {
    // A push belongs with the email: a send by SMS alone has none.
    const sent = await notifyUser(event, delivery.userId, {
      topic: HELP_CENTER_TOPICS.send,
      ...(wantsEmail ? { email: delivery.message } : {}),
      push: delivery.push,
    })
    result.emailed = sent.channels.includes('email')
    result.pushed = sent.channels.includes('push')
  }
  else if (wantsEmail) {
    await dispatchEmailNotification({ to: delivery.to!, ...delivery.message })
    result.emailed = true
  }
  if (delivery.sms && delivery.phone) {
    await dispatchSMSNotification({ to: delivery.phone, body: delivery.smsBody })
    result.texted = true
  }
  return result
}
