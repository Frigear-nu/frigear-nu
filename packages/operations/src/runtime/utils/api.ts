// Typed path builders of the operations HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id and slug is URL-encoded.

const enc = encodeURIComponent

/** Public and self-service routes, under `/api/operations`. */
const PUBLIC_BASE = '/api/operations'
/** Staff routes, under `/api/admin/operations`. */
const ADMIN_BASE = '/api/admin/operations'

export const operationsApi = {
  /** `GET` the public operations and, when signed in, the ones the caller takes part in (`?status=` filters). */
  list: PUBLIC_BASE,
  /** `GET` one operation by its URL name: public ones for everyone, others for those who take part. */
  operation: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}`,
  me: {
    /** `GET` the operations the caller takes part in (`viewer.operationIds` of `@frigear-nu/audience`). */
    operations: `${PUBLIC_BASE}/me`,
  },
  admin: {
    /** `GET` (paginated) / `POST` operations. */
    operations: ADMIN_BASE,
    /** `GET` / `PATCH` / `DELETE` one operation. */
    operation: (id: string) => `${ADMIN_BASE}/${enc(id)}`,
    /** `POST` `{ status }` to move an operation along its life cycle. */
    status: (id: string) => `${ADMIN_BASE}/${enc(id)}/status`,
  },
} as const
