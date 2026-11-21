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

/** The channels that went out, and the ones that were tried and failed. */
export type CrewSendResult = { channels: Array<'email' | 'sms' | 'push'>, failed: Array<'email' | 'sms' | 'push'> }

/**
 * Sends the person their status message. With `@frigear-nu/push` installed it goes through `notifyUser` on the
 * `crew.status` topic: email and push, by the person's own choice and as far as they can be reached. Without push it is what
 * crew always did: the email through `dispatchEmailNotification`. Never throws: a failure is logged and the attempted
 * channels are reported as `failed`.
 */
export async function crewSend(event: H3Event | undefined, userId: number, email: EmailNotification): Promise<CrewSendResult> {
  if (pushAvailable && notifyUser) {
    try {
      const result = await notifyUser(event, userId, {
        topic: CREW_TOPICS.status,
        email: { subject: email.subject, body: email.body, text: email.text, replyTo: email.replyTo, template: email.template, meta: email.meta as Record<string, unknown> | undefined },
        push: crewPushFromEmail(email),
      })
      return { channels: result.channels, failed: (Object.keys(result.skipped) as Array<'email' | 'sms' | 'push'>).filter(channel => result.skipped[channel] === 'failed') }
    }
    catch (error) {
      console.error('[crew] the status message could not be sent', error)
      return { channels: [], failed: ['email', 'push'] }
    }
  }
  try {
    await dispatchEmailNotification(email)
    return { channels: ['email'], failed: [] }
  }
  catch (error) {
    console.error('[crew] the status email could not be sent', error)
    return { channels: [], failed: ['email'] }
  }
}
