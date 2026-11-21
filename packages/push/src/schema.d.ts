import type { ModuleOptions, NotificationTopic } from './types'

declare module '@nuxt/schema' {
  interface NuxtOptions {
    push?: ModuleOptions & {
      /** What `extendNotificationTopics` collected; read once every module has set up. */
      _topics?: NotificationTopic[]
    }
  }
}

export {}
