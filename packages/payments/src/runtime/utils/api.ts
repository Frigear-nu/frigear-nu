// Typed path builders of the payments HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

const BASE = '/api/payments'
const ADMIN_BASE = '/api/admin/payments'

export const paymentsApi = {
  me: {
    /** `GET` the caller's payments, newest first. */
    list: `${BASE}/me`,
    /** `POST` to get a checkout URL for one of the caller's unpaid payments. */
    resume: (id: string) => `${BASE}/me/${enc(id)}/resume`,
  },
  admin: {
    /** `GET` the dashboard's recent payments and revenue (staff). */
    recent: `${ADMIN_BASE}/recent`,
    /** `GET` one user's payments (staff, `?limit`); mounted on the users admin. */
    userPayments: (userId: number | string) => `/api/admin/users/${enc(String(userId))}/payments`,
  },
} as const
