import type { NotificationTopic } from '@frigear-nu/push/utils'

// The notification topics shifts registers with `extendNotificationTopics` when `@frigear-nu/push` is installed (the rows of
// the account's channel matrix, and what `notifyUser` checks a person's choices against). The defaults are email and push;
// SMS is offered where it costs money for a reason (a reminder, a broadcast) and stays off until the person turns it on.

export const SHIFTS_TOPICS = {
  reminder: 'shifts.reminder',
  swap: 'shifts.swap',
  broadcast: 'shifts.broadcast',
} as const

export type ShiftsTopic = typeof SHIFTS_TOPICS[keyof typeof SHIFTS_TOPICS]

export const shiftsNotificationTopics: NotificationTopic[] = [
  {
    id: SHIFTS_TOPICS.reminder,
    label: { da: 'Vagtpåmindelser', en: 'Shift reminders' },
    description: { da: 'En påmindelse før dine vagter starter.', en: 'A reminder before your shifts start.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'sms', 'push'],
  },
  {
    id: SHIFTS_TOPICS.swap,
    label: { da: 'Vagtbytter', en: 'Shift swaps' },
    description: { da: 'Tilbud, svar og godkendelser, når vagter byttes.', en: 'Offers, answers and approvals when shifts are swapped.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'push'],
  },
  {
    id: SHIFTS_TOPICS.broadcast,
    label: { da: 'Beskeder til vagtholdet', en: 'Messages to the shift team' },
    description: { da: 'Beskeder fra ledere og koordinatorer til dit hold.', en: 'Messages from leads and coordinators to your team.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'sms', 'push'],
  },
]

/** The types of `#shifts/push`, the server module that stands in for `notifyUser` when push is not installed. */
export const SHIFTS_PUSH_MODULE_TYPES = `declare module '#shifts/push' {
  import type { H3Event } from 'h3'
  export const notifyUser: ((event: H3Event | undefined, userId: number, input: {
    topic: string
    email?: { subject: string, body: string, text?: string, replyTo?: string, template?: { name: string, props?: Record<string, unknown>, locale?: string }, meta?: Record<string, unknown> }
    sms?: { body: string }
    push?: { title: string, body: string, url?: string }
  }) => Promise<{ channels: Array<'email' | 'sms' | 'push'>, skipped: Partial<Record<'email' | 'sms' | 'push', string>> }>) | undefined
  export const pushAvailable: boolean
}
`
