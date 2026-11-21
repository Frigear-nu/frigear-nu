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
  /** `GET` the venue layout of an operation (a plane layout of `@frigear-nu/maps`), for whoever may read it. */
  venueLayout: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}/venue-layout`,
  /** `GET` the underlay image of the venue layout. */
  venueUnderlay: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}/venue-layout/underlay`,
  me: {
    /** `GET` the operations the caller takes part in (`takesPart` of `@frigear-nu/audience`). */
    operations: `${PUBLIC_BASE}/me`,
  },
  admin: {
    /** `GET` (paginated) / `POST` operations. */
    operations: ADMIN_BASE,
    /** `GET` / `PATCH` / `DELETE` one operation. */
    operation: (id: string) => `${ADMIN_BASE}/${enc(id)}`,
    /** `POST` `{ status }` to move an operation along its life cycle. */
    status: (id: string) => `${ADMIN_BASE}/${enc(id)}/status`,
    /** `GET` / `PUT` `{ layout }` the venue layout (a plane layout of `@frigear-nu/maps`). */
    venueLayout: (id: string) => `${ADMIN_BASE}/${enc(id)}/venue-layout`,
    /** `POST` (multipart `file`) the underlay image of the venue layout. */
    venueUnderlay: (id: string) => `${ADMIN_BASE}/${enc(id)}/venue-layout/underlay`,
  },
} as const
