export type NotificationMeta<AdditionalMeta = Record<string, unknown>> = {
  driver?: string
} & AdditionalMeta
/**
 * Generic, transport-agnostic notification. Concrete notifications (e.g. a password reset)
 * build one of these and hand it to `dispatchSimpleNotification`, similar in spirit to how Laravel
 * notifications render themselves to a `toMail()` payload before a channel sends it.
 */
export interface SimpleNotification<M = Record<string, unknown>> {
  title: string
  text: string
  /** Optional URL to open when the notification is clicked. */
  url?: string
  meta?: M
}

/** Text, or one text per locale (`{ da: '...', en: '...' }`), for a driver that picks by the recipient's locale. */
export type PushText = string | Record<string, string>

/**
 * A push notification to the devices of one or more users. Concrete notifications build one of these and hand it to
 * `dispatchPushNotification`; the driver (`notify.push.driver`) finds the users' devices and delivers it.
 * `@frigear-nu/push` is that driver when it is installed (FCM and APNs to the devices it stores).
 */
export interface PushNotification<M = NotificationMeta> {
  /** The users to reach, on every device the driver knows for them. */
  userIds: number[]
  /** Text, or one text per locale: a driver that knows each device's locale picks it (else `en`). */
  title: PushText
  body: PushText
  /** Where the app goes when the notification is opened (a path in the app or a URL). */
  url?: string
  /** Extra string data delivered with the notification. */
  data?: Record<string, string>
  meta?: M
}

/**
 * What a push driver may answer: how many devices took the notification. A driver that cannot tell (the `log` driver)
 * answers nothing, so `dispatchPushNotification` resolves to `undefined`.
 */
export type PushDispatchResult = {
  /** Devices the provider accepted. */
  sent: number
  /** Devices that failed. */
  failed: number
  /** Devices whose token turned out dead and were dropped, when the driver tracks it. */
  revoked?: number
}

/**
 * Generic, transport-agnostic SMS notification. Concrete notifications (e.g. a password reset)
 * build one of these and hand it to `dispatchSMSNotification`, similar in spirit to how Laravel
 * notifications render themselves to a `toMail()` payload before a channel sends it.
 */
export interface SMSNotification<M = NotificationMeta> {
  to: string | string[]
  body: string
  meta?: M
}

/**
 * Generic, transport-agnostic email notification. Concrete notifications (e.g. a password reset)
 * build one of these and hand it to `dispatchEmailNotification`, similar in spirit to how Laravel
 * notifications render themselves to a `toMail()` payload before a channel sends it.
 */
export interface EmailNotification<M = NotificationMeta> {
  to: string | string[]
  subject: string
  /** HTML body. */
  body: string
  /** Optional plain-text body. */
  text?: string
  /** Address replies should go to (the `Reply-To` header). */
  replyTo?: string
  /**
   * `Cc` recipients. Optional and additive: every built-in driver (`resend`, `ses`, `cloudflare`, `log`) passes them
   * on. A custom driver whose transport has no cc may ignore them, and should say so where it is documented.
   */
  cc?: string | string[]
  /**
   * Extra headers, such as `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058). The built-in `resend`, `ses` and
   * `cloudflare` drivers pass them on, and `log` logs them. Headers the provider sets itself (`From`, `To`, `Subject`,
   * `Message-ID`, `Date`) cannot be set; Cloudflare accepts only its allowlisted headers and `X-` headers and rejects the
   * whole send otherwise. A custom driver whose transport has no headers may ignore them.
   */
  headers?: Record<string, string>
  /**
   * Template to render this email from instead of `subject`/`body`/`text`, when a renderer is
   * installed (`@frigear-nu/email-templates` listens on the `notify:email` hook). Without one,
   * the notification goes out as built, so `subject` and `body` are always the fallback.
   */
  template?: EmailTemplateRef
  meta?: M
}

/**
 * A template to render an email from: its name (the template's file name, e.g. `auth-magic-link`)
 * and the props to render it with. Deliberately untyped here: the names only exist once a
 * renderer has scanned the templates (see `sendEmailTemplate` in `@frigear-nu/email-templates`).
 */
export type EmailTemplateRef = {
  name: string
  props?: Record<string, unknown>
  /** Locale to render with, when the renderer has i18n. */
  locale?: string
}

/**
 * A directory of email templates (top-level `*.vue` files, named by file name) that a module
 * ships, registered through the `notify:email:templates` Nuxt hook. Only used when a renderer
 * (`@frigear-nu/email-templates`) is installed; host templates with the same name win.
 */
export type EmailTemplateSource = {
  dir: string
}

/**
 * Passed to the `notify:email` Nitro hook before an email is handed to the driver. Listeners may
 * replace or mutate `notification`, e.g. to render `notification.template`.
 */
export type NotifyEmailContext = {
  notification: EmailNotification
}

/**
 * A driver is anything that knows how to actually deliver an `EmailNotification` - log it,
 * hand it to Resend, talk to an SMTP server, etc. Keeping the signature this small makes it
 * trivial to plug in new drivers without this module depending on any of them.
 */
export type SimpleDriver = (notification: SimpleNotification) => Promise<void> | void
export type SMSDriver = (notification: SMSNotification) => Promise<void> | void
export type EmailDriver = (notification: EmailNotification) => Promise<void> | void
// `void` so a driver that reports nothing (`async () => {}`, like the other drivers) still fits.
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type PushDriver = (notification: PushNotification) => Promise<PushDispatchResult | void> | PushDispatchResult | void
export type NotificationChannelDriver = SimpleDriver | SMSDriver | EmailDriver | PushDriver

export type StoredNotification = {
  id: string
  type: 'email' | 'sms' | 'simple' | string
  data: EmailNotification | SMSNotification | SimpleNotification
  error?: string
  sentAt?: Date
  createdAt: Date
  updatedAt?: Date
}

export type NotificationStore<S = StoredNotification> = {
  put(notification: S): Promise<void>
  get(id: string): Promise<S | null>
  list(): Promise<S[]>
  delete(id: string): Promise<void>
}

// --- notifyUser: topics, channels and the stores other modules register ------------------------------------------

/** The channels `notifyUser` can reach a user on. */
export type NotificationChannel = 'email' | 'sms' | 'push'

/** A text in one language, or per locale code (`{ da, en }`). */
export type Translated = string | Record<string, string>

/** What a module declares with `extendNotificationTopics`: one kind of message a user can choose channels for. */
export type NotificationTopic = {
  /** Stable id (`shifts.reminder`); the key the user's choices are stored under. */
  id: string
  /** The label the account page shows. */
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

/** Which channels are on, for one topic. */
export type ChannelSettings = Record<NotificationChannel, boolean>

/** What a user chose, per topic id. A topic (or a channel) left out uses the topic's defaults. */
export type NotificationChoices = Record<string, Partial<ChannelSettings>>

/** How `notifyUser` reaches a user: what the registered recipient store answers. */
export type NotifyRecipient = {
  /** Where email goes; without it the email channel is `unavailable`. */
  email?: string | null
  /** Where SMS goes; without it the SMS channel is `unavailable`. */
  phone?: string | null
  /** The user's language (`da`, `en-GB`): picks the SMS text and the email template's locale when they have none. */
  locale?: string | null
}

/**
 * Resolves user ids to the contacts `notifyUser` sends to. `@frigear-nu/users` registers one (`setNotifyRecipientStore`).
 * Without one, `notifyUser` sends nothing and logs a warning.
 */
export interface NotifyRecipientStore {
  /** The contacts of a user, or `null` when there is no such user. */
  findRecipient(userId: number): Promise<NotifyRecipient | null>
}

/**
 * Reads and writes each user's channel choices per topic. `@frigear-nu/preferences` registers one
 * (`setNotifyChoicesStore`). Without one, every user gets the topics' defaults and nothing can be changed.
 */
export interface NotifyChoicesStore {
  /** What the user chose, per topic id. */
  readChoices(userId: number): Promise<NotificationChoices>
  /**
   * Merges the channels given into what is stored for each topic, per channel and against a fresh read of the stored
   * choices (not one the caller made earlier), so concurrent changes to other channels or topics are kept. Channels and
   * topics left out keep what they had.
   */
  writeChoices(userId: number, choices: NotificationChoices): Promise<void>
}

/** A topic as the account page shows it. */
export type NotificationTopicDto = {
  id: string
  label: Translated
  labelKey?: string
  description?: Translated
  descriptionKey?: string
  channels: NotificationChannel[]
}

export type NotificationChannelsRow = NotificationTopicDto & {
  /** What the user has chosen, or the topic's defaults. */
  settings: ChannelSettings
  /** Whether the user chose it (`false`: the defaults apply). */
  custom: boolean
}

/** Every registered topic with what applies to one user (`readNotificationChannels`). */
export type NotificationChannelsDto = {
  /** `true` when the user has a phone number, so SMS can work. */
  hasPhone: boolean
  topics: NotificationChannelsRow[]
}

export type NotifyUserInput = {
  /** A topic registered with `extendNotificationTopics`; an unknown one throws. */
  topic: string
  /**
   * The email to send, to the recipient's address. `template` and `meta` are handed to `dispatchEmailNotification` as
   * they are (`subject` and `body` stay the fallback when no renderer is installed).
   */
  email?: { subject: string, body: string, text?: string, replyTo?: string, headers?: Record<string, string>, template?: EmailTemplateRef, meta?: Record<string, unknown> }
  /** The text of an SMS, or one per locale (the recipient's locale picks it). */
  sms?: { body: Translated }
  /** The push notification, through notify's push driver (`dispatchPushNotification`). */
  push?: { title: Translated, body: Translated, url?: string, data?: Record<string, string> }
}

export type NotifyUserResult = {
  /** The channels that went out. */
  channels: NotificationChannel[]
  /** Channels the user's choices (or a missing address, phone or device) skipped, with why. */
  skipped: Partial<Record<NotificationChannel, 'disabled' | 'unavailable' | 'no_content' | 'failed'>>
}

/** What other modules registered at build time (`extendNotificationTopics`, `setNotify*Store`), on `nuxt.options.notify`. */
export type NotifyBuildState = {
  _topics?: NotificationTopic[]
  /** Path of a module whose default export is a `NotifyRecipientStore`. First registration wins. */
  _recipientStore?: string
  /** Path of a module whose default export is a `NotifyChoicesStore`. First registration wins. */
  _choicesStore?: string
}

export type ModuleOptions = {
  email?: {
    // Selects the driver used to deliver email notifications dispatched through this module:
    // either the name of a built-in driver (`'log'`, the default - logs instead of sending) or a
    // path to a function (default export) matching the `EmailDriver` signature above, for a real
    // provider (Resend, SMTP, ...). This is an app/consuming-layer concern - modules that need to
    // send email (e.g. `@frigear-nu/users`) just dispatch notifications; they never decide how.
    //
    // Built-in names are `'resend'`, `'ses'` and `'cloudflare'` (zero-dependency, `fetch` only).
    // These only set the default: the driver and its credentials are read at runtime from
    // `NUXT_NOTIFY_EMAIL_DRIVER`, `NUXT_NOTIFY_EMAIL_FROM`, `NUXT_NOTIFY_EMAIL_RESEND_API_TOKEN`,
    // `NUXT_NOTIFY_EMAIL_SES_*` and `NUXT_NOTIFY_EMAIL_CLOUDFLARE_*` (see `NotifyRuntimeConfig`).
    driver?: 'log' | 'resend' | 'ses' | 'cloudflare' | (string & {})
  }
  sms?: {
    // Selects the driver used to deliver SMS notifications dispatched through this module: either
    // the name of a built-in driver (`'log'`, the default - logs instead of sending) or a path to
    // a function (default export) matching the `SMSDriver` signature above, for a real provider
    // (Twilio, ...).
    driver?: string | 'log'
  }
  simple?: {
    // Selects the driver used to deliver generic, transport-agnostic `SimpleNotification`s
    // dispatched through this module: either the name of a built-in driver (`'log'`, the default
    // - logs instead of sending) or a path to a function (default export) matching the
    // `SimpleDriver` signature above.
    driver?: string | 'log'
  }
  push?: {
    // Selects the driver used to deliver `PushNotification`s dispatched through this module: either the name of a
    // built-in driver (`'log'`, the default - logs instead of sending) or a path to a function (default export)
    // matching the `PushDriver` signature above. `@frigear-nu/push` sets itself as the default when it is installed;
    // a value set here wins.
    driver?: string | 'log'
  }
}

/** Private runtime config (`runtimeConfig.notify`), overridable through `NUXT_NOTIFY_*` env vars. */
export type NotifyRuntimeConfig = {
  email: {
    /** `NUXT_NOTIFY_EMAIL_DRIVER`: `log` (default), `resend`, `ses` or `cloudflare`. */
    driver: string
    /** `NUXT_NOTIFY_EMAIL_FROM`: sender address, e.g. `Frigear <no-reply@frigear.nu>`. */
    from: string
    /** `NUXT_NOTIFY_EMAIL_RESEND_API_TOKEN` */
    resend: { apiToken: string }
    /** `NUXT_NOTIFY_EMAIL_SES_REGION`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`, `_SESSION_TOKEN` (optional) */
    ses: { region: string, accessKeyId: string, secretAccessKey: string, sessionToken: string }
    /** `NUXT_NOTIFY_EMAIL_CLOUDFLARE_ACCOUNT_ID`, `_API_TOKEN` */
    cloudflare: { accountId: string, apiToken: string }
  }
}
