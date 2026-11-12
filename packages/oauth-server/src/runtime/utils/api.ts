// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).

const enc = encodeURIComponent

/** The module API: the consent data and the caller's applications under `/api/oauth-server`, staff routes under `/api/admin/oauth-server`. */
export const oauthServerApi = {
  /** `GET`: data for the consent screen (the authorization request's parameters as the query). */
  consent: '/api/oauth-server/consent',
  me: {
    /** `GET`: the applications the signed-in user may sign in to. */
    applications: '/api/oauth-server/me/applications',
    /** `GET`: the applications the caller is signed in to, one entry each; `DELETE` (204) signs out of all of them. */
    sessions: '/api/oauth-server/me/sessions',
    /** `DELETE` (204): signs out of one application, on every device. */
    session: (applicationId: string) => `/api/oauth-server/me/sessions/${enc(applicationId)}`,
  },
  admin: {
    /** `GET` (paginated) and `POST` (create, 201). */
    applications: '/api/admin/oauth-server/applications',
    /** `GET`, `PATCH`, `DELETE` (204). */
    application: (id: string) => `/api/admin/oauth-server/applications/${enc(id)}`,
    /** `POST`: replaces the client secret and answers `{ clientSecret }` once. */
    rotateSecret: (id: string) => `/api/admin/oauth-server/applications/${enc(id)}/secret`,
    /** `POST`: signs everyone out of the application; answers the application. */
    revoke: (id: string) => `/api/admin/oauth-server/applications/${enc(id)}/revoke`,
    /** `GET` (every scope: database ones and the read-only ones of config and modules) and `POST` (create, 201). */
    scopes: '/api/admin/oauth-server/scopes',
    /** `GET`, `PATCH`, `DELETE` (204) of a database scope. */
    scope: (name: string) => `/api/admin/oauth-server/scopes/${enc(name)}`,
  },
} as const

/** The OAuth 2.0 / OpenID Connect endpoints, at their standard paths. */
export const oidc = {
  configuration: '/.well-known/openid-configuration',
  jwks: '/.well-known/jwks.json',
  authorize: '/oauth/authorize',
  token: '/oauth/token',
  revoke: '/oauth/revoke',
  userinfo: '/oauth/userinfo',
  /** RFC 7662 token introspection, for the client a token was issued to (or its shared audience). */
  introspect: '/oauth/introspect',
} as const
