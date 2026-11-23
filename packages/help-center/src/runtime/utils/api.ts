// Typed path builders of the help center HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id and slug is URL-encoded.

const enc = encodeURIComponent

/** Public and viewer-filtered routes, under `/api/help-center`. */
const PUBLIC_BASE = '/api/help-center'
/** Staff routes, under `/api/admin/help-center`. */
const ADMIN_BASE = '/api/admin/help-center'

export const helpCenterApi = {
  /** `GET` the categories the viewer may read (`?public=1` for what anonymous visitors read, `?kind=help|faq`). */
  categories: `${PUBLIC_BASE}/categories`,
  /** `GET` the articles the viewer may read, without their text. `?q=`, `?category=<slug>`, `?kind=help|faq`, `?public=1`. */
  articles: `${PUBLIC_BASE}/articles`,
  /** `GET` one article with its text and category, by its URL name. `?public=1` reads it as an anonymous visitor. */
  article: (slug: string) => `${PUBLIC_BASE}/articles/${enc(slug)}`,
  /**
   * `GET` categories with their published articles and text, for the FAQ cards. `?categories=a,b` (in that order; none
   * for every `faq` category), `?public=1`.
   */
  faqs: `${PUBLIC_BASE}/faqs`,
  me: {
    /** `GET` the onboarding checklists the viewer may see, with what they have read. */
    checklists: `${PUBLIC_BASE}/me/checklists`,
    /** `POST` `{ articleId }` to mark an article the viewer may read as read. */
    reads: `${PUBLIC_BASE}/me/reads`,
  },
  // Every admin route takes `?kind=help|faq`: lists keep to that kind, and a record of the other kind is a 404 (an
  // article created with it must go in a category of that kind). A `PATCH` may still move an article to a category of
  // the other kind, or change a category's kind: the scope is the kind the record has before the change. The help center
  // admin passes `help`, the FAQ admin `faq`.
  admin: {
    /** `GET` (all, or `?kind=`) / `POST` categories (`kind` in the body). */
    categories: `${ADMIN_BASE}/categories`,
    /**
     * `PATCH` / `DELETE` one category. A `PATCH` with the other `kind` changes the kind of the category, its subcategories
     * and their articles; a change to `faq` takes those articles off the checklists.
     */
    category: (id: string) => `${ADMIN_BASE}/categories/${enc(id)}`,
    /** `GET` what a change of the category to the other kind affects (counts for the confirm dialog). */
    categoryKindChange: (id: string) => `${ADMIN_BASE}/categories/${enc(id)}/kind-change`,
    /** `GET` every article of a category (drafts too), in their order. */
    categoryArticles: (id: string) => `${ADMIN_BASE}/categories/${enc(id)}/articles`,
    /** `POST` `{ articleIds }`: every article of the category, in the new order. */
    reorder: (id: string) => `${ADMIN_BASE}/categories/${enc(id)}/reorder`,
    /** `GET` (paginated, every source) / `POST` a draft article. */
    articles: `${ADMIN_BASE}/articles`,
    /** `GET` / `PATCH` / `DELETE` one article; `GET` also reads an article of another source by its id (read-only). */
    article: (id: string) => id.includes('/')
      // An id of another source with a `/` (`content:help:safety/first-aid`): an encoded `%2F` is refused under /api, so each
      // segment is encoded and the slashes stay.
      ? `${ADMIN_BASE}/source-articles/${id.split('/').map(enc).join('/')}`
      : `${ADMIN_BASE}/articles/${enc(id)}`,
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
    /** `POST` `{ articleIds, audience, channels, fallbackToEmail? }` to send article links. */
    send: `${ADMIN_BASE}/send`,
    /** `GET` `?q=` people for the send form's picker (`help-center:send`; emails with `help-center:pii`). */
    users: `${ADMIN_BASE}/users`,
  },
} as const
