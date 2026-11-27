import type { NotificationTopic } from '@frigear-nu/notify/utils'

// The notification topic campaigns registers with notify's `extendNotificationTopics`: the row of the account's
// notifications page for messages staff send to users. Email and push by default; SMS is offered but off until the
// person turns it on. Campaigns to lists do not use it: they reach their subscribers, who unsubscribe per list.

export const CAMPAIGNS_TOPICS = { message: 'campaigns.message' } as const

export const campaignsNotificationTopics: NotificationTopic[] = [
  {
    id: CAMPAIGNS_TOPICS.message,
    label: { da: 'Beskeder fra os', en: 'Messages from us' },
    description: { da: 'Beskeder, der sendes til dig og andre fra denne side.', en: 'Messages sent to you and others from this site.' },
    defaults: { email: true, sms: false, push: true },
    channels: ['email', 'sms', 'push'],
  },
]
