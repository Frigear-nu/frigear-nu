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
  /** `POST` (anonymous, RFC 8058 one-click): unsubscribes the subscription the token was made for. */
  unsubscribe: (token: string) => `/api/campaigns/unsubscribe/${segment(token)}`,
  me: {
    /** `GET` the signed-in user's newsletters; `PATCH { lists: { [listId]: { email?, sms? } } }` changes them. */
    subscriptions: '/api/campaigns/me/subscriptions',
  },
  admin: {
    /** `GET` every list with its counts; `POST` creates one (`campaigns:manage`). */
    lists: '/api/admin/campaigns/lists',
    /** `GET`, `PATCH`, `DELETE` one list (`campaigns:manage`). */
    list: (id: string) => `/api/admin/campaigns/lists/${segment(id)}`,
    /** `GET` a page of a list's subscribers (`campaigns:manage`; addresses with `campaigns:pii`). */
    subscribers: (id: string) => `/api/admin/campaigns/lists/${segment(id)}/subscribers`,
  },
} as const
