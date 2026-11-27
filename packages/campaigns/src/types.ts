/** A text that is either one string for every language, or a map of locale -> text. */
export type Translated = string | Record<string, string>

/** The channels a list reaches people on. */
export type CampaignChannel = 'email' | 'sms'

/** `pending` until the person confirms, `active`, or `unsubscribed`. */
export type CampaignSubscriptionStatus = 'pending' | 'active' | 'unsubscribed'

/**
 * Where a subscription's consent came from: `form` (the signup component or an embedded HTML form), `api` (the subscribe
 * route called by other code), `admin`, `forms` (a forms submission) or `account` (the signed-in user's account page, or the account's sign-up).
 */
export type CampaignSubscriptionSource = 'form' | 'api' | 'admin' | 'forms' | 'account'

/**
 * A list and new accounts: `off`, `offer` (an unticked box per list on the registration form) or `auto` (every new
 * account is added; for lists that are not marketing, which staff answer for).
 */
export type CampaignListSignupMode = 'off' | 'offer' | 'auto'

/** Which fields of a forms form hold the email address, phone number, name and consent checkbox. */
export type CampaignFormFields = { email?: string, phone?: string, name?: string, consent?: string }

/** The captcha providers of `@frigear-nu/forms` the subscribe route can check. */
export type CampaignCaptchaProvider = 'turnstile' | 'recaptcha' | 'hcaptcha'

/** Page paths: `true` for the default path, a string for another, `false` to leave the page out. */
export type CampaignPagesOptions = {
  /** `/subscriptions/confirm`: confirms a subscription from the link in the confirmation message. */
  confirm?: string | boolean
  /** `/subscriptions/unsubscribe`: unsubscribes from a link in a message. */
  unsubscribe?: string | boolean
  /** `/account/subscriptions`: the signed-in user's subscriptions. */
  account?: string | boolean
  /** `/admin/campaigns/lists`, with `@frigear-nu/admin`. */
  adminLists?: string | boolean
  /** `/admin/campaigns/lists/:id`, with `@frigear-nu/admin`. */
  adminList?: string | boolean
  /** `/admin/campaigns`: the campaigns, with `@frigear-nu/admin`. */
  adminCampaigns?: string | boolean
  /** `/admin/campaigns/:id`: one campaign, with `@frigear-nu/admin`. */
  adminCampaign?: string | boolean
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
  /** Deliveries the `campaigns:deliver` task sends per run (every minute). Default `200`. */
  batchSize?: number
  /**
   * Days the per-recipient rows of a finished campaign (`campaign_deliveries`, `campaign_clicks`) are kept; the counts
   * stay on the campaign. `false` keeps them. Default `180`.
   */
  retentionDays?: number | false
  /** Cron of the `campaigns:deliver` task. Default every minute (`* * * * *`); `false` registers it without a schedule. */
  deliverCron?: string | false
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
    adminCampaigns?: string
    adminCampaign?: string
  }
  /** The captcha the signup shows, or `null`. */
  captcha: CampaignCaptchaProvider | null
  i18n: CampaignLocaleRouting | null
  /** `@frigear-nu/forms` is installed: staff can map a form to a list. */
  forms: boolean
}

export type CampaignsRuntimeConfig = {
  rateLimit: number
  rateLimitWindowSeconds: number
  confirmTtlHours: number
  resendAfterSeconds: number
  corsOrigins: string[]
  captcha: CampaignCaptchaProvider | false
  signingKey: string
  batchSize: number
  retentionDays: number | false
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

/** A list the registration form offers (`signupMode: 'offer'`, public): an unticked box with its consent text. */
export type CampaignSignupListDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  consentText: Translated | null
}

/** `GET /api/admin/campaigns/lists/:id/accounts`: how many accounts "Add all current accounts" would add now. */
export type CampaignAddAccountsPreviewDto = { accounts: number }

/** `POST /api/admin/campaigns/lists/:id/accounts`: how many accounts were added. */
export type CampaignAddAccountsResultDto = { added: number }

/** A forms form staff can map to a list, with the fields that can hold an address, a name or the consent. */
export type CampaignFormOptionDto = {
  id: string
  slug: string
  name: string
  status: string
  fields: Array<{ key: string, type: string, label: Translated | null }>
}

/** A list as staff see it. */
export type CampaignListDto = CampaignListPublicDto & {
  id: string
  public: boolean
  signupMode: CampaignListSignupMode
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

/** One list on the signed-in user's subscriptions page. */
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

// --- Campaigns -------------------------------------------------------------------------------------------------------

/**
 * `newsletter` ("To lists"): to the subscribers of lists (email, SMS). `message` ("To people"): to users (email, SMS,
 * push).
 */
export type CampaignKind = 'newsletter' | 'message'

/** The channels a campaign goes out on: push only for messages to users. */
export type CampaignSendChannel = 'email' | 'sms' | 'push'

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'

export type CampaignDeliveryStatus = 'queued' | 'sending' | 'sent' | 'skipped' | 'failed'

/**
 * Who a campaign goes to: `listIds` (a campaign to lists: the active subscribers of these lists, each person once per channel),
 * or `grants` and/or `userIds` (a message: the members of the grants, `@frigear-nu/auth`, and these users).
 */
export type CampaignAudience = {
  listIds?: string[]
  grants?: Array<{ kind: string } & Record<string, unknown>>
  userIds?: string[]
}

/** The text per channel. The email body is markdown (bold, italics, links, paragraphs), rendered and escaped server side. */
export type CampaignContent = {
  email?: { subject: Translated, body: Translated }
  sms?: { body: Translated }
  push?: { title: Translated, body: Translated, url?: string | null }
}

/** Deliveries of one channel by state, and how many recipients opened (with `trackOpens`) and clicked. */
export type CampaignChannelCounts = {
  total: number
  queued: number
  sent: number
  skipped: number
  failed: number
  opened: number
  clicked: number
  /** Every counted click, a recipient clicking twice counts twice. */
  clicks: number
}

export type CampaignCounts = Partial<Record<CampaignSendChannel, CampaignChannelCounts>>

/** A campaign as staff see it (`/api/admin/campaigns`). */
export type CampaignDto = {
  id: string
  kind: CampaignKind
  name: string
  channels: CampaignSendChannel[]
  audience: CampaignAudience
  content: CampaignContent
  locale: string | null
  trackClicks: boolean
  trackOpens: boolean
  important: boolean
  status: CampaignStatus
  scheduledAt: string | null
  startedAt: string | null
  finishedAt: string | null
  cancelledAt: string | null
  createdBy: number | null
  sentBy: number | null
  counts: CampaignCounts | null
  createdAt: string
  updatedAt: string
}

/** `GET /api/admin/campaigns/:id/preview`: how many recipients each channel would reach now. */
export type CampaignPreviewDto = {
  /** Distinct people (contacts or users). */
  recipients: number
  channels: Partial<Record<CampaignSendChannel, number>>
}

/** One link of a campaign with its clicks. */
export type CampaignLinkStatsDto = {
  id: string
  url: string
  shortLinkId: string
  position: number
  /** Clicks attributed to a recipient (`campaign_clicks`). */
  clicks: number
  /** Recipients who clicked it. */
  recipients: number
}

/** `GET /api/admin/campaigns/:id/stats`. */
export type CampaignStatsDto = {
  status: CampaignStatus
  counts: CampaignCounts
  /**
   * Skipped deliveries by reason (`disabled`, `unavailable`, `unsubscribed`, `cancelled`), every channel together. Read
   * from the delivery rows, so empty once `campaigns:retention` pruned them.
   */
  skipReasons: Partial<Record<string, number>>
  links: CampaignLinkStatsDto[]
}

/** One person found by `GET /api/admin/campaigns/users` (the message form's picker). `email` only with `campaigns:pii`. */
export type CampaignUserLookupDto = {
  id: number
  name: string | null
  avatar: string | null
  email?: string | null
}

/** One delivery (`GET /api/admin/campaigns/:id/deliveries`, `campaigns:pii` only). */
export type CampaignDeliveryDto = {
  id: string
  channel: CampaignSendChannel
  status: CampaignDeliveryStatus
  skipReason: string | null
  attempts: number
  sentAt: string | null
  openedAt: string | null
  clickedAt: string | null
  clicks: number
  error: string | null
  recipient: {
    userId: number | null
    contactId: string | null
    name: string | null
    /** The contact's address on the channel; for users, read from their account at send time, so not shown here. */
    address: string | null
  }
}

/** What unsubscribing with the token of a message to a user answers: the user's `campaigns.message` channel is off. */
export type CampaignTopicUnsubscribeDto = {
  topic: 'campaigns.message'
  channel: CampaignSendChannel
  status: 'unsubscribed'
}

/** `POST /api/campaigns/unsubscribe/:token`: a subscription, or the notification topic of a message to a user. */
export type CampaignUnsubscribeResultDto = CampaignSubscriptionResultDto | CampaignTopicUnsubscribeDto
