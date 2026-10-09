/** A string, or a map of locale code -> string (`{ da: '...', en: '...' }`). */
export type Localized = string | Record<string, string>

/** A cookie (or similar storage entry) set under a category - listed in the preferences dialog for GDPR transparency. */
export interface ConsentCookie {
  name: string
  provider?: string
  purpose?: Localized
  /** Human readable, e.g. `'1 year'` or `'Session'`. */
  duration?: string
}

export interface ConsentCategory {
  key: string
  /** Always on and not switchable (strictly necessary cookies). */
  required?: boolean
  /** Pre-selected state in the preferences dialog. Never applied without the user saving. Default `false`. */
  defaultEnabled?: boolean
  label?: Localized
  description?: Localized
  cookies?: ConsentCookie[]
}

export interface ConsentMessages {
  description: string
  accept: string
  reject: string
  preferences: string
  expand: string
  manage: string
  save: string
  preferencesTitle: string
  preferencesDescription: string
  required: string
  policy: string
  cookies: string
}

export interface ModuleOptions {
  /** Name of the consent cookie. Default `cookie-consent`. */
  cookieName?: string
  /** Cookie lifetime in seconds. Default 180 days. */
  maxAge?: number
  /** Manual version. Changing it asks every visitor again. The category set is hashed into the version automatically. */
  version?: string
  /** Categories to show. Defaults to `necessary` (required), `analytics` and `marketing`. Other modules add more via `extendCookieConsent`. */
  categories?: ConsentCategory[]
  /** Routes where the banner is hidden. Default `['/authorize']`. */
  excludeRoutes?: string[]
  /** Collapse the banner into a round button once scrolled this many px (`true` = 80, `false` = never). Default `true`. */
  collapseOnScroll?: boolean | number
  /** Link to the cookie/privacy policy shown in the banner. */
  policyUrl?: string
  /** Override/extend built-in texts per locale. Built-in: `da`, `en`. */
  messages?: Record<string, Partial<ConsentMessages>>
  /**
   * Store the consent on the signed-in user (`@frigear-nu/users` + `@nuxthub/core` required).
   * Default: `true` when `@frigear-nu/users` is installed.
   */
  persistToUser?: boolean
}

export interface PublicModuleOptions {
  cookieName: string
  maxAge: number
  version: string
  categories: ConsentCategory[]
  excludeRoutes: string[]
  collapseThreshold: number | false
  policyUrl?: string
  messages: Record<string, Partial<ConsentMessages>>
  persistToUser: boolean
}

/** What is stored in the consent cookie and (for signed-in users) in the database. */
export interface ConsentState {
  /** Consent version the choice was made against. */
  v: string
  /** Epoch milliseconds when the choice was made. */
  ts: number
  categories: Record<string, boolean>
}
