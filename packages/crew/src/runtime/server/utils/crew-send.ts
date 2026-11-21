import type { H3Event } from 'h3'
import type { EmailNotification } from '@frigear-nu/notify/types'
import { notifyUser, pushAvailable } from '#crew/push'
import { CREW_TOPICS } from '../../notifications'

/** The push notification of a status email: its subject, the template's message (else the subject) and the status link. */
export function crewPushFromEmail(email: EmailNotification): { title: string, body: string, url?: string } {
  const props = email.template?.props ?? {}
  const message = typeof props.message === 'string' && props.message ? props.message : email.subject
  const url = typeof props.statusUrl === 'string' && props.statusUrl ? props.statusUrl : undefined
  return { title: email.subject, body: message.length > 200 ? `${message.slice(0, 197)}...` : message, ...(url ? { url } : {}) }
}

/**
 * Sends the person their status message. With `@frigear-nu/push` installed it goes through `notifyUser` on the
 * `crew.status` topic: email and push, by the person's own choice and as far as they can be reached. Without push it is what
 * crew always did: the email through `dispatchEmailNotification`. A failure throws (the caller logs it and goes on).
 * Returns the channels that went out when push is installed, `['email']` otherwise.
 */
export async function crewSend(event: H3Event | undefined, userId: number, email: EmailNotification): Promise<Array<'email' | 'sms' | 'push'>> {
  if (pushAvailable && notifyUser) {
    const result = await notifyUser(event, userId, {
      topic: CREW_TOPICS.status,
      email: { subject: email.subject, body: email.body, text: email.text, replyTo: email.replyTo, template: email.template, meta: email.meta as Record<string, unknown> | undefined },
      push: crewPushFromEmail(email),
    })
    return result.channels
  }
  await dispatchEmailNotification(email)
  return ['email']
}
