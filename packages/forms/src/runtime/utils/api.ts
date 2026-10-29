// Typed path builders of the forms HTTP API. App code, tests and docs use these instead of string literals, so a
// changed URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

/** Public routes, under `/api/forms`. */
const PUBLIC_BASE = '/api/forms'
/** Staff routes, under `/api/admin/forms`. */
const ADMIN_BASE = '/api/admin/forms'

export const formsApi = {
  /** `GET` a published form's definition. */
  form: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}`,
  /** `GET` what the public page needs to pick between the form, a gate and "not found". */
  access: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}/access`,
  /** `POST` a submission (JSON or multipart). */
  submit: (slug: string) => `${PUBLIC_BASE}/${enc(slug)}/submit`,
  admin: {
    /** `GET` (paginated) / `POST` forms. */
    forms: ADMIN_BASE,
    /** `POST` an import of form definitions. */
    import: `${ADMIN_BASE}/import`,
    /** `GET` / `PATCH` / `DELETE` (archive) one form. */
    form: (id: string) => `${ADMIN_BASE}/${enc(id)}`,
    /** `POST` a copy of a form as a new draft. */
    clone: (id: string) => `${ADMIN_BASE}/${enc(id)}/clone`,
    /** `GET` a form's submissions (paginated). */
    submissions: (formId: string) => `${ADMIN_BASE}/${enc(formId)}/submissions`,
    /** `GET` / `POST` a form's access tokens. */
    tokens: (formId: string) => `${ADMIN_BASE}/${enc(formId)}/tokens`,
    /** `DELETE` (revoke) one access token. */
    token: (formId: string, tokenId: string) => `${ADMIN_BASE}/${enc(formId)}/tokens/${enc(tokenId)}`,
    /** `GET` / `PUT` / `DELETE` a form's shared password. */
    password: (formId: string) => `${ADMIN_BASE}/${enc(formId)}/password`,
    /** `GET` which of a form's secrets are set. */
    secrets: (formId: string) => `${ADMIN_BASE}/${enc(formId)}/secrets`,
    /** `PUT` / `DELETE` one secret of a form. */
    secret: (formId: string, key: string) => `${ADMIN_BASE}/${enc(formId)}/secrets/${enc(key)}`,
    /** `GET` one submission. */
    submission: (id: string) => `${ADMIN_BASE}/submissions/${enc(id)}`,
    /** `GET` (download) one uploaded file of a submission. */
    submissionFile: (id: string, fileId: string) => `${ADMIN_BASE}/submissions/${enc(id)}/files/${enc(fileId)}`,
    /** `POST` to run delivery of a stored submission again. */
    redeliver: (id: string) => `${ADMIN_BASE}/submissions/${enc(id)}/redeliver`,
  },
} as const
