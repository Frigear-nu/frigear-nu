import type { NotificationTopic } from '@frigear-nu/push/utils'

// The notification topic help center registers with `extendNotificationTopics` when `@frigear-nu/push` is installed: the row of
// the account's channel matrix for "someone sent you help articles". Email and push by default; SMS is not offered on the
// topic, so a send's SMS channel keeps using `dispatchSMSNotification` directly (the sender asked for it).

export const HELP_CENTER_TOPICS = { send: 'help-center.send' } as const

export const helpCenterNotificationTopics: NotificationTopic[] = [
  {
    id: HELP_CENTER_TOPICS.send,
    label: { da: 'Hjælpeartikler sendt til dig', en: 'Help articles sent to you' },
    description: { da: 'Når nogen sender dig links til artikler i hjælpecenteret.', en: 'When somebody sends you links to help center articles.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'push'],
  },
]
