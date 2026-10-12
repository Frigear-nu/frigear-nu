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
 * A notification that is intended to be displayed in the UI, e.g. via a toast or snackbar.
 * The `type` field can be used to determine the styling of the notification.
 */
export interface UINotification<A = unknown, M = NotificationMeta> extends SimpleNotification<M> {
  type?: 'success' | 'error' | 'info' | 'warning'
  actions?: A[]
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
  meta?: M
}

/**
 * A driver is anything that knows how to actually deliver an `EmailNotification` - log it,
 * hand it to Resend, talk to an SMTP server, etc. Keeping the signature this small makes it
 * trivial to plug in new drivers without this module depending on any of them.
 */
export type SimpleDriver = (notification: SimpleNotification) => Promise<void> | void
export type SMSDriver = (notification: SMSNotification) => Promise<void> | void
export type EmailDriver = (notification: EmailNotification) => Promise<void> | void
/**
 * Unlike the server-side drivers above, a UI driver is a *composable factory*: `useNotify()` calls
 * it once, synchronously, during its own (setup-time) invocation, and uses the function it returns
 * to actually dispatch notifications later. This is required because driver implementations that
 * need Vue's `inject()` (e.g. the built-in `@nuxt/ui` driver's `useToast()`) only work when called
 * during a component's `setup()` - resolving them lazily, when a notification is dispatched (e.g.
 * from a `setInterval` callback), runs outside any component and breaks `inject()`.
 */
export type UIDriver = () => (notification: UINotification) => Promise<void> | void

export type NotificationChannelDriver = SimpleDriver | SMSDriver | EmailDriver

export type StoredNotification = {
  id: string
  type: 'email' | 'sms' | 'simple' | string
  data: EmailNotification | SMSNotification | SimpleNotification | UINotification
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
  // Selects the driver used to push notifications to the UI (e.g. `@nuxt/ui`'s `useToast`).
  // Unlike the server-side drivers above, this is only ever set up (and its files only ever
  // written/loaded) when explicitly configured - there's no sensible default UI to push to.
  ui?: {
    driver?: string | '@nuxt/ui'
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

export type ModulePublicRuntimeConfig = {
  // For UI usage...
  ui?: {
    driver?: string | '@nuxt/ui'
  }
}
