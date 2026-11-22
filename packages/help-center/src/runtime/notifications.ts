import type { NotificationTopic } from '@frigear-nu/notify/utils'

// The notification topic help center registers with notify's `extendNotificationTopics`: the row of the account's
// notifications page for "someone sent you help articles". Email and push by default; SMS is offered but off until the
// person turns it on, so a send by SMS only texts the people who chose it.

export const HELP_CENTER_TOPICS = { send: 'help-center.send' } as const

export const helpCenterNotificationTopics: NotificationTopic[] = [
  {
    id: HELP_CENTER_TOPICS.send,
    label: { da: 'Hjælpeartikler sendt til dig', en: 'Help articles sent to you' },
    description: { da: 'Når nogen sender dig links til artikler i hjælpecenteret.', en: 'When somebody sends you links to help center articles.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'sms', 'push'],
  },
]
