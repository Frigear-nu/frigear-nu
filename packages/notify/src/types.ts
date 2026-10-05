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
export interface UINotification<A = unknown, M = Record<string, unknown>> extends SimpleNotification<M> {
  type?: 'success' | 'error' | 'info' | 'warning'
  actions?: A[]
}

/**
 * Generic, transport-agnostic SMS notification. Concrete notifications (e.g. a password reset)
 * build one of these and hand it to `dispatchSMSNotification`, similar in spirit to how Laravel
 * notifications render themselves to a `toMail()` payload before a channel sends it.
 */
export interface SMSNotification {
  to: string | string[]
  body: string
}

/**
 * Generic, transport-agnostic email notification. Concrete notifications (e.g. a password reset)
 * build one of these and hand it to `dispatchEmailNotification`, similar in spirit to how Laravel
 * notifications render themselves to a `toMail()` payload before a channel sends it.
 */
export interface EmailNotification {
  to: string | string[]
  subject: string
  /** HTML body. */
  body: string
  /** Optional plain-text body. */
  text?: string
}

/**
 * A driver is anything that knows how to actually deliver an `EmailNotification` - log it,
 * hand it to Resend, talk to an SMTP server, etc. Keeping the signature this small makes it
 * trivial to plug in new drivers without this module depending on any of them.
 */
export type SimpleDriver = (notification: SimpleNotification) => Promise<void> | void
export type UIDriver = (notification: UINotification) => Promise<void> | void
export type SMSDriver = (notification: SMSNotification) => Promise<void> | void
export type EmailDriver = (notification: EmailNotification) => Promise<void> | void

export type ModuleOptions = {
  email?: {
    // Selects the driver used to deliver email notifications dispatched through this module:
    // either the name of a built-in driver (`'log'`, the default - logs instead of sending) or a
    // path to a function (default export) matching the `EmailDriver` signature above, for a real
    // provider (Resend, SMTP, ...). This is an app/consuming-layer concern - modules that need to
    // send email (e.g. `@frigear-nu/users`) just dispatch notifications; they never decide how.
    driver?: string | 'log'
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

export type ModulePublicRuntimeConfig = {
  // For UI usage...
  ui?: {
    driver?: string | '@nuxt/ui'
  }
}
