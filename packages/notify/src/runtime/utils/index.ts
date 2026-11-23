// Pure helpers and the build-time registration API, safe to import from the Vue app, Nitro code and a module's own
// `setup()` (only a type import of `@nuxt/schema`).
export {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TOPIC_ID_MAX_LENGTH,
  extendNotificationTopics,
  readTranslated,
  resolveChannelSettings,
  setNotifyChoicesStore,
  setNotifyRecipientStore,
  topicChannels,
} from './topics'

export type {
  ChannelSettings,
  NotificationChannel,
  NotificationChannelsDto,
  NotificationChannelsRow,
  NotificationChoices,
  NotificationTopic,
  NotificationTopicDto,
  NotifyChoicesStore,
  NotifyRecipient,
  NotifyRecipientStore,
  NotifyUserInput,
  NotifyUserResult,
  Translated,
} from '../../types'
