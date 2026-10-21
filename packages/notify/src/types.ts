export type NotificationMeta<AdditionalMeta = Record<string, unknown>> = {
  driver?: string
} & AdditionalMeta
/**
 * Generic, transport-agnostic push notification. Concrete notifications (e.g. a password reset)
 * build one of these and hand it to `dispatchPushNotification`, similar in spirit to how Laravel
 * notifications render themselves to a `toMail()` payload before a channel sends it.
 */
export interface SimpleNotification<M = Record<string, unknown>> {
  title: string
  text: string
  /** Optional URL to open when the notification is clicked. */
  url?: string
  meta?: M
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
export type NotificationChannelDriver = SimpleDriver | SMSDriver | EmailDriver

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
  // TODO in the future...
  push?: {
    driver?: string
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
