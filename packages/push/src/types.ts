import type { H3Event } from 'h3'

/** `web` exists in the data model for later; v1 registers `ios` and `android` only. */
export type PushPlatform = 'ios' | 'android' | 'web'

export type NotificationChannel = 'email' | 'sms' | 'push'

/** A text in one language, or per locale code (`{ da, en }`). */
export type Translated = string | Record<string, string>

export type PushDriverName = 'log' | 'providers'

/**
 * Who a device token belongs to: `fcm` (Firebase Cloud Messaging, which also delivers to iOS through APNs) or `apns`
 * (Apple, sent directly over HTTP/2). Android tokens are always FCM tokens.
 */
export type PushProvider = 'fcm' | 'apns'

export type ModuleOptions = {
  settings?: {
    /**
     * How `sendPush` delivers: `log` writes the push to the server log, `providers` sends it to FCM and APNs. Unset
     * (the default) it is `providers` once credentials are configured and `log` otherwise, so development needs no
     * setup. `NUXT_PUSH_DRIVER` overrides it at runtime.
     */
    driver?: PushDriverName
    pages?: {
      /** The account page with the channel matrix. `true` mounts it at `/account/notifications` (the default). */
      notifications?: string | boolean
    }
    /**
     * Register the device as soon as someone is signed in (a Capacitor app with `@frigear-nu/mobile`). `false` leaves
     * it to the app: call `usePushDevice().register()` at a better moment than right after sign-in. Defaults to `true`.
     */
    autoRegister?: boolean
  }
}

export type PushPublicConfig = {
  /** `server` or `client`, the app's `authentication.mode`. */
  mode: 'server' | 'client'
  pages: { notifications?: string }
  autoRegister: boolean
}

/** Credentials are private runtime config: set them with `NUXT_PUSH_*` environment variables. */
export type PushRuntimeConfig = {
  /** `log`, `providers` or empty for the automatic choice (see `ModuleOptions`). */
  driver: string
  /** How long a provider request may take, in milliseconds, before the device counts as failed. Defaults to 10000. */
  timeoutMs: number | string
  /**
   * The provider of an iOS token whose device did not say (`NUXT_PUSH_IOS`): `apns` (the default) or `fcm`. A device
   * registered with a `provider` always goes there. The device side of this module always says, so this is only for
   * other clients and rows registered before the column existed.
   */
  ios: string
  fcm: {
    /** The Firebase service account JSON (the whole file), for FCM HTTP v1. */
    serviceAccount: string
  }
  apns: {
    /** The key id of the `.p8` authentication key. */
    keyId: string
    /** The Apple developer team id. */
    teamId: string
    /** The app's bundle id (the `apns-topic`). */
    topic: string
    /** The `.p8` private key (PEM). Literal `\n` are accepted, so it fits one env line. */
    privateKey: string
    /** `true` sends to the sandbox (`api.sandbox.push.apple.com`), for development builds of the app. */
    sandbox: boolean | string
  }
}

/** What a module declares with `extendNotificationTopics`: one row of the channel matrix. */
export type NotificationTopic = {
  /** Stable id (`shifts.reminder`); the key preferences are stored under. */
  id: string
  /** The label the matrix shows. */
  label?: Translated
  /** An i18n key (`shifts.topics.reminder`) tried before `label`. */
  labelKey?: string
  description?: Translated
  descriptionKey?: string
  /** What applies until the user chooses. A channel the topic does not offer is off whatever this says. */
  defaults: Record<NotificationChannel, boolean>
  /** The channels the topic can use. Defaults to all three. */
  channels?: NotificationChannel[]
}

export type NotificationTopicDto = {
  id: string
  label: Translated
  labelKey?: string
  description?: Translated
  descriptionKey?: string
  channels: NotificationChannel[]
}

export type ChannelSettings = Record<NotificationChannel, boolean>

export type ChannelMatrixRow = NotificationTopicDto & {
  /** What the user has chosen, or the topic's defaults. */
  settings: ChannelSettings
  /** Whether the user chose it (`false`: the defaults apply). */
  custom: boolean
}

/** `GET /api/push/me/channels`. */
export type ChannelMatrixDto = {
  /** `true` when the user has a phone number, so SMS can work. */
  hasPhone: boolean
  /** `true` when the user has a registered device, so push can work. */
  hasDevice: boolean
  topics: ChannelMatrixRow[]
}

/** `PUT /api/push/me/channels`: the topics to change; others stay as they are. */
export type ChannelMatrixInput = {
  topics: Record<string, Partial<ChannelSettings>>
}

export type PushDeviceDto = {
  id: string
  userId: number
  platform: PushPlatform
  /** Where its pushes go. `null` only for a device registered before providers were stored: `push.ios` decides. */
  provider: PushProvider | null
  appId: string | null
  locale: string | null
  lastSeenAt: string
  createdAt: string
  revokedAt: string | null
}

/** `POST /api/push/me/devices`. */
export type RegisterDeviceInput = {
  platform: Exclude<PushPlatform, 'web'>
  token: string
  /**
   * Who issued `token`. Unset: `fcm` on Android, `push.ios` on iOS (`apns` by default). An iOS app that registers its
   * FCM token (`@capacitor-firebase/messaging`) sends `fcm`, so its pushes go through FCM.
   */
  provider?: PushProvider
  appId?: string
  locale?: string
}

export type PushMessage = {
  userIds: number[]
  /** Text, or one text per locale (`{ da, en }`): each device gets the one for its registered locale, else `en`. */
  title: Translated
  body: Translated
  /** Where the app goes when the notification is opened (a path in the app or a URL). */
  url?: string
  /** Extra string data delivered with the notification. */
  data?: Record<string, string>
}

export type SendPushResult = {
  /** Devices the provider accepted. */
  sent: number
  /** Devices that failed for a reason other than a dead token. */
  failed: number
  /** Devices whose token the provider reported as dead, now revoked. */
  revoked: number
}

/** A template to render an email from (`@frigear-nu/email-templates`), as `EmailNotification.template` of notify takes it. */
export type NotifyUserEmailTemplate = { name: string, props?: Record<string, unknown>, locale?: string }

export type NotifyUserInput = {
  topic: string
  /**
   * The email to send. `template` and `meta` are handed to `dispatchEmailNotification` as they are (`subject` and `body`
   * stay the fallback when no renderer is installed), so a module can send the same email through `notifyUser` that it
   * sent with `dispatchEmailNotification` before.
   */
  email?: { subject: string, body: string, text?: string, replyTo?: string, template?: NotifyUserEmailTemplate, meta?: Record<string, unknown> }
  sms?: { body: string }
  push?: { title: Translated, body: Translated, url?: string, data?: Record<string, string> }
}

export type NotifyUserResult = {
  /** The channels that went out. */
  channels: NotificationChannel[]
  /** Channels the user's preferences (or a missing address, phone or device) skipped, with why. */
  skipped: Partial<Record<NotificationChannel, 'disabled' | 'unavailable' | 'no_content' | 'failed'>>
}

export type PushDeviceRegisteredContext = {
  event: H3Event
  device: PushDeviceDto
}
