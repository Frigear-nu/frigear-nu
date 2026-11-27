// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).

const segment = (value: string) => encodeURIComponent(value)

/** The campaigns API. */
export const campaignsApi = {
  /** `GET` a public list as the signup shows it (anonymous). */
  list: (slug: string) => `/api/campaigns/lists/${segment(slug)}`,
  /**
   * `POST { email?, phone?, name?, locale?, channels?, consent, captcha? }` (anonymous, JSON or a plain HTML form): signs
   * up for a public list. Answers `{ confirm }`, the same for every address.
   */
  subscribe: (slug: string) => `/api/campaigns/lists/${segment(slug)}/subscribe`,
  /** `POST` (anonymous): confirms the subscription of the token in the confirmation message. */
  confirm: (token: string) => `/api/campaigns/confirm/${segment(token)}`,
  /**
   * `POST` (anonymous, RFC 8058 one-click): unsubscribes what the token was made for: a subscription, or (the token of a
   * campaign message) its lists, or for a message to a user their `campaigns.message` channel.
   */
  unsubscribe: (token: string) => `/api/campaigns/unsubscribe/${segment(token)}`,
  /** `GET` (anonymous): the 1x1 image of a campaign email; marks it opened when the campaign has `trackOpens`. */
  open: (token: string) => `/api/campaigns/o/${segment(token)}`,
  /** `GET` the lists the registration form offers (anonymous): public lists with `signupMode: 'offer'`. */
  signupLists: '/api/campaigns/signup/lists',
  me: {
    /** `GET` the signed-in user's subscriptions; `PATCH { lists: { [listId]: { email?, sms? } } }` changes them. */
    subscriptions: '/api/campaigns/me/subscriptions',
  },
  admin: {
    /** `GET` every list with its counts; `POST` creates one (`campaigns:manage`). */
    lists: '/api/admin/campaigns/lists',
    /** `GET`, `PATCH`, `DELETE` one list (`campaigns:manage`). */
    list: (id: string) => `/api/admin/campaigns/lists/${segment(id)}`,
    /** `GET` a page of a list's subscribers (`campaigns:manage`; addresses with `campaigns:pii`). */
    subscribers: (id: string) => `/api/admin/campaigns/lists/${segment(id)}/subscribers`,
    /**
     * `GET` how many accounts "Add all current accounts" would add to an `auto` list; `POST` adds them
     * (`campaigns:manage`).
     */
    accounts: (id: string) => `/api/admin/campaigns/lists/${segment(id)}/accounts`,
    /** `GET` the forms a list can sign people up from, with their fields (`campaigns:manage`; with `@frigear-nu/forms`). */
    forms: '/api/admin/campaigns/forms',
    /** `GET` a page of campaigns (`campaigns:manage`); `POST` creates a draft. */
    campaigns: '/api/admin/campaigns',
    /** `GET`, `PATCH` (a draft), `DELETE` (a draft) one campaign (`campaigns:manage`). */
    campaign: (id: string) => `/api/admin/campaigns/${segment(id)}`,
    /** `GET` how many recipients each channel would reach now (`campaigns:manage`). */
    preview: (id: string) => `/api/admin/campaigns/${segment(id)}/preview`,
    /** `POST` sends a draft now (`campaigns:send`; `campaigns:send-important` when important). */
    send: (id: string) => `/api/admin/campaigns/${segment(id)}/send`,
    /** `POST { scheduledAt }` schedules a draft (`campaigns:send`; `campaigns:send-important` when important). */
    schedule: (id: string) => `/api/admin/campaigns/${segment(id)}/schedule`,
    /** `POST` stops a scheduled or sending campaign (`campaigns:send`). */
    cancel: (id: string) => `/api/admin/campaigns/${segment(id)}/cancel`,
    /** `GET` counts per channel and clicks per link (`campaigns:manage`). */
    stats: (id: string) => `/api/admin/campaigns/${segment(id)}/stats`,
    /** `GET` a page of deliveries with their recipients (`campaigns:pii`). */
    deliveries: (id: string) => `/api/admin/campaigns/${segment(id)}/deliveries`,
    /**
     * `GET ?q=` people by name for the message form's picker, or `?ids=1,2` the people a draft names (`campaigns:manage`;
     * matching and showing emails with `campaigns:pii`).
     */
    users: '/api/admin/campaigns/users',
  },
} as const
