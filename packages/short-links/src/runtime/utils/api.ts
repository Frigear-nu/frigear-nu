// Typed path builders of the short-links HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

const ADMIN_BASE = '/api/admin/short-links'

export const shortLinksApi = {
  admin: {
    /** `GET` every short link, paginated (`?q`, `?owner`, `?status`, `?sort`); `POST` to make one by hand. */
    links: ADMIN_BASE,
    /** `GET` the owner modules that have links (for the owner filter). */
    owners: `${ADMIN_BASE}/owners`,
    /** `PATCH` a link made by hand (code, target, title, expiry, tracking). */
    link: (id: string) => `${ADMIN_BASE}/${enc(id)}`,
    /** `POST` to disable any link, whoever owns it. */
    disable: (id: string) => `${ADMIN_BASE}/${enc(id)}/disable`,
    /** `POST` to enable a disabled link again. */
    enable: (id: string) => `${ADMIN_BASE}/${enc(id)}/enable`,
  },
} as const
