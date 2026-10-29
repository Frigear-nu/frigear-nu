// Typed path builders of the subscriptions HTTP API. App code, tests and docs use these instead of string literals, so
// a changed URL is changed in one place.

const BASE = '/api/subscriptions'
const enc = encodeURIComponent
const userBase = (userId: number | string) => `/api/admin/users/${enc(String(userId))}/membership`

export const subscriptionsApi = {
  /** `GET` the configured plans with live prices (public). */
  plans: `${BASE}/plans`,
  me: {
    /** `GET` the caller's subscriptions and active plan (also the account bootstrap's `subscriptions:me`). */
    subscriptions: `${BASE}/me`,
    /** `POST` to start a checkout or change plan (sessions only). */
    checkout: `${BASE}/me/checkout`,
    /** `POST` to open the Stripe billing portal (sessions only). */
    portal: `${BASE}/me/portal`,
  },
  admin: {
    /** `GET` the user's current membership and grantable plans / `POST` a free grant / `DELETE` the free grant (staff). */
    membership: userBase,
    /** `GET` the user's whole subscription history (staff). */
    history: (userId: number | string) => `${userBase(userId)}/history`,
    /** `POST` a Checkout link for the user, optionally emailed (staff). */
    paymentLink: (userId: number | string) => `${userBase(userId)}/payment-link`,
  },
} as const
