/** A text that is either one string for every language, or a map of locale -> text. */
export type Translated = string | Record<string, string>

/** The channels a newsletter reaches people on. */
export type CampaignChannel = 'email' | 'sms'

/** `pending` until the person confirms, `active`, or `unsubscribed`. */
export type CampaignSubscriptionStatus = 'pending' | 'active' | 'unsubscribed'

/**
 * Where a subscription's consent came from: `form` (the signup component or an embedded HTML form), `api` (the subscribe
 * route called by other code), `admin`, `forms` (a forms submission) or `account` (the signed-in user's account page).
 */
export type CampaignSubscriptionSource = 'form' | 'api' | 'admin' | 'forms' | 'account'

/** Which fields of a forms form hold the email address, phone number, name and consent checkbox. */
export type CampaignFormFields = { email?: string, phone?: string, name?: string, consent?: string }

/** The captcha providers of `@frigear-nu/forms` the subscribe route can check. */
export type CampaignCaptchaProvider = 'turnstile' | 'recaptcha' | 'hcaptcha'

/** Page paths: `true` for the default path, a string for another, `false` to leave the page out. */
export type CampaignPagesOptions = {
  /** `/newsletter/confirm`: confirms a subscription from the link in the confirmation message. */
  confirm?: string | boolean
  /** `/newsletter/unsubscribe`: unsubscribes from a link in a message. */
  unsubscribe?: string | boolean
  /** `/account/newsletters`: the signed-in user's newsletters. */
  account?: string | boolean
  /** `/admin/campaigns/lists`, with `@frigear-nu/admin`. */
  adminLists?: string | boolean
  /** `/admin/campaigns/lists/:id`, with `@frigear-nu/admin`. */
  adminList?: string | boolean
}

export type ModuleOptions = {
  settings?: {
    pages?: CampaignPagesOptions
  }
  /** Signups per IP address and list in `rateLimitWindowSeconds`. `0` turns the limit off. Default `10`. */
  rateLimit?: number
  /** Default `600` (ten minutes). */
  rateLimitWindowSeconds?: number
  /** How long a confirmation link works, in hours. Default `72`. */
  confirmTtlHours?: number
  /**
   * A new signup for an address that is already waiting to confirm sends the confirmation again only once this many
   * seconds have passed since the last one, so nobody can flood an inbox. Default `300`.
   */
  resendAfterSeconds?: number
  /**
   * Origins of other sites allowed to call the subscribe route from the browser (`https://example.org`). Plain HTML
   * forms need none. Env `NUXT_CAMPAIGNS_CORS_ORIGINS` (JSON array).
   */
  corsOrigins?: string[]
  /**
   * A captcha the subscribe route checks, through `@frigear-nu/forms` (its site and secret keys). `false` (the default)
   * checks none.
   */
  captcha?: false | CampaignCaptchaProvider
  /**
   * The key unsubscribe links and IP hashes are signed with. Unset, it is derived from Nuxt's `appSecret`
   * (`NUXT_APP_SECRET`). Env `NUXT_CAMPAIGNS_SIGNING_KEY`.
   */
  signingKey?: string
}

/** Locale routing of `@nuxtjs/i18n`, so links in messages get the person's locale prefix. */
export type CampaignLocaleRouting = { strategy: string, defaultLocale: string | null, locales: string[] }

export type PublicModuleOptions = {
  pages: {
    confirm?: string
    unsubscribe?: string
    account?: string
    adminLists?: string
    adminList?: string
  }
  /** The captcha the signup shows, or `null`. */
  captcha: CampaignCaptchaProvider | null
  i18n: CampaignLocaleRouting | null
}

export type CampaignsRuntimeConfig = {
  rateLimit: number
  rateLimitWindowSeconds: number
  confirmTtlHours: number
  resendAfterSeconds: number
  corsOrigins: string[]
  captcha: CampaignCaptchaProvider | false
  signingKey: string
}

// --- DTOs ------------------------------------------------------------------------------------------------------------

/** A list as the public signup sees it. */
export type CampaignListPublicDto = {
  slug: string
  name: Translated
  description: Translated | null
  channels: CampaignChannel[]
  doubleOptIn: boolean
  consentText: Translated | null
  consentVersion: number
}

/** Subscriber counts of a list, per channel. */
export type CampaignListCounts = Record<CampaignChannel, { active: number, pending: number, unsubscribed: number }>

/** A list as staff see it. */
export type CampaignListDto = CampaignListPublicDto & {
  id: string
  public: boolean
  formId: string | null
  formFields: CampaignFormFields | null
  counts: CampaignListCounts
  createdAt: string
  updatedAt: string
}

/** One subscription in the subscribers table. `email` and `phone` are only there with `campaigns:pii`. */
export type CampaignSubscriberDto = {
  id: string
  channel: CampaignChannel
  status: CampaignSubscriptionStatus
  source: CampaignSubscriptionSource
  consentVersion: number | null
  requestedAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  contact: {
    id: string
    name: string | null
    locale: string | null
    userId: number | null
    email?: string | null
    phone?: string | null
  }
}

/** What the subscribe route answers: the same for every address, so it never tells whether one is known. */
export type CampaignSubscribeResponse = {
  /** `true` when the person has to confirm from the message they were sent. */
  confirm: boolean
}

/** What the confirm and unsubscribe routes answer. */
export type CampaignSubscriptionResultDto = {
  list: { slug: string, name: Translated }
  channel: CampaignChannel
  status: CampaignSubscriptionStatus
}

/** One list on the signed-in user's newsletters page. */
export type CampaignMyListDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  channels: CampaignChannel[]
  consentText: Translated | null
  /** The user's subscription per channel; a channel without one is absent. */
  subscriptions: Partial<Record<CampaignChannel, CampaignSubscriptionStatus>>
}

/** `GET /api/campaigns/me/subscriptions`. */
export type CampaignMySubscriptionsDto = {
  /** Whether the user's email address is verified: signups from the account page are then active at once. */
  emailVerified: boolean
  lists: CampaignMyListDto[]
}
