// Typed path builders of the help center HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id and slug is URL-encoded.

const enc = encodeURIComponent

/** Public and viewer-filtered routes, under `/api/help-center`. */
const PUBLIC_BASE = '/api/help-center'
/** Staff routes, under `/api/admin/help-center`. */
const ADMIN_BASE = '/api/admin/help-center'

export const helpCenterApi = {
  /** `GET` the categories the viewer may read (`?public=1` for what anonymous visitors read). */
  categories: `${PUBLIC_BASE}/categories`,
  /** `GET` the articles the viewer may read, without their text. `?q=`, `?category=<slug>`, `?public=1`. */
  articles: `${PUBLIC_BASE}/articles`,
  /** `GET` one article with its text and category, by its URL name. `?public=1` reads it as an anonymous visitor. */
  article: (slug: string) => `${PUBLIC_BASE}/articles/${enc(slug)}`,
  me: {
    /** `GET` the onboarding checklists the viewer may see, with what they have read. */
    checklists: `${PUBLIC_BASE}/me/checklists`,
    /** `POST` `{ articleId }` to mark an article the viewer may read as read. */
    reads: `${PUBLIC_BASE}/me/reads`,
  },
  admin: {
    /** `GET` (all) / `POST` categories. */
    categories: `${ADMIN_BASE}/categories`,
    /** `PATCH` / `DELETE` one category. */
    category: (id: string) => `${ADMIN_BASE}/categories/${enc(id)}`,
    /** `GET` (paginated, every source) / `POST` a draft article. */
    articles: `${ADMIN_BASE}/articles`,
    /** `GET` / `PATCH` / `DELETE` one article. */
    article: (id: string) => `${ADMIN_BASE}/articles/${enc(id)}`,
    /** `POST` to publish an article (every required locale must be filled in). */
    publish: (id: string) => `${ADMIN_BASE}/articles/${enc(id)}/publish`,
    /** `POST` to turn a published article back into a draft. */
    unpublish: (id: string) => `${ADMIN_BASE}/articles/${enc(id)}/unpublish`,
    /** `GET` / `POST` checklists. */
    checklists: `${ADMIN_BASE}/checklists`,
    /** `GET` / `PATCH` (with `items`) / `DELETE` one checklist. */
    checklist: (id: string) => `${ADMIN_BASE}/checklists/${enc(id)}`,
    /** `GET` (paginated, needs `help-center:pii`) who read what for a checklist. */
    progress: (id: string) => `${ADMIN_BASE}/checklists/${enc(id)}/progress`,
    /** `POST` `{ articleIds, audience, channels }` to send article links. */
    send: `${ADMIN_BASE}/send`,
  },
} as const
