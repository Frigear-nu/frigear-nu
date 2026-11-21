import type { NotificationTopic } from '@frigear-nu/push/utils'

// The notification topic crew registers with `extendNotificationTopics` when `@frigear-nu/push` is installed: the row of the
// account's channel matrix for "your application changed". Email and push by default; SMS is not offered.

export const CREW_TOPICS = { status: 'crew.status' } as const

export const crewNotificationTopics: NotificationTopic[] = [
  {
    id: CREW_TOPICS.status,
    label: { da: 'Status på din ansøgning', en: 'Your crew application' },
    description: { da: 'Når din ansøgning bliver godkendt, afvist eller sat på venteliste.', en: 'When your application is approved, rejected or put on the waiting list.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'push'],
  },
]

/** The types of `#crew/push`, the server module that stands in for `notifyUser` when push is not installed. */
export const CREW_PUSH_MODULE_TYPES = `declare module '#crew/push' {
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
