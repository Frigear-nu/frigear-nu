// Typed path builders of the FAQ HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id and slug is URL-encoded.

const enc = encodeURIComponent

/** Public and viewer-filtered routes, under `/api/faq`. */
const PUBLIC_BASE = '/api/faq'
/** Staff routes, under `/api/admin/faq`. */
const ADMIN_BASE = '/api/admin/faq'

export const faqApi = {
  /** `GET` the groups the viewer may read, each with its published items. `?slugs=a,b`, `?operation=<id>`, `?public=1`. */
  groups: `${PUBLIC_BASE}/groups`,
  /** `GET` one group by its URL name, with its published items the viewer may read. */
  group: (slug: string) => `${PUBLIC_BASE}/groups/${enc(slug)}`,
  /** `GET` the items whose question or answer contains `?q=` (every language) among the ones the viewer may read. */
  search: `${PUBLIC_BASE}/search`,
  admin: {
    /** `GET` (paginated) / `POST` groups. */
    groups: `${ADMIN_BASE}/groups`,
    /** `GET` / `PATCH` / `DELETE` one group. */
    group: (id: string) => `${ADMIN_BASE}/groups/${enc(id)}`,
    /** `GET` every item of a group (any status) / `POST` a new draft item. */
    items: (groupId: string) => `${ADMIN_BASE}/groups/${enc(groupId)}/items`,
    /** `POST` `{ itemIds }` to put a group's items in that order. */
    reorder: (groupId: string) => `${ADMIN_BASE}/groups/${enc(groupId)}/reorder`,
    /** `PATCH` / `DELETE` one item. */
    item: (id: string) => `${ADMIN_BASE}/items/${enc(id)}`,
    /** `POST` to publish an item (every required locale must be filled in). */
    publish: (id: string) => `${ADMIN_BASE}/items/${enc(id)}/publish`,
    /** `POST` to turn a published item back into a draft. */
    unpublish: (id: string) => `${ADMIN_BASE}/items/${enc(id)}/unpublish`,
  },
} as const
