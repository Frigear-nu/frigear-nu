import type { NotificationTopic } from '@frigear-nu/notify/utils'

// The notification topic crew registers with notify's `extendNotificationTopics`: the row of the account's notifications
// page for "your application changed". Email and push by default; SMS is not offered.

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
