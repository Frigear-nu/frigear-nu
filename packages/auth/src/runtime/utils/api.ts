// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).

const enc = encodeURIComponent
const base = '/api/auth'

/** The auth API under `/api/auth`, plus the frigear.nu browser callback at `/auth/frigear`. */
export const authApi = {
  /** `POST { email, password }`: signs in (password). */
  login: `${base}/login`,
  /** `POST { name, email, password }`: creates an account (201). */
  register: `${base}/register`,
  /** `POST { email }`: emails a reset link; always answers the same. */
  forgotPassword: `${base}/forgot-password`,
  /** `POST { code, password, confirmPassword }`: sets a new password and signs in. */
  resetPassword: `${base}/reset-password`,
  /** `POST { email, name?, redirect? }`: emails a sign-in link; always answers the same. */
  magicLink: `${base}/magic-link`,
  /** `POST { code }`: signs in with an emailed link, answers `{ redirect }`. */
  magicLinkConfirm: `${base}/magic-link/confirm`,
  /** `POST`: clears the session (204). */
  logout: `${base}/logout`,
  /** `GET`: the OAuth sign-in buttons of this deployment. */
  providers: `${base}/providers`,
  /** `GET`: OAuth sign-in (and callback) through a nuxt-auth-utils provider. A browser navigation, not a fetch. */
  provider: (key: string) => `${base}/${enc(key)}`,
  /** `GET`: "Log in with frigear.nu" (OIDC) and its callback. A browser navigation, registered at the IdP. */
  frigear: '/auth/frigear',
  /** `GET`: `{ enabled }`, whether "Log in with frigear.nu" is active for this deployment. */
  frigearStatus: `${base}/frigear-status`,
  /** `GET` (session only): the scopes the caller may grant a token. */
  scopes: `${base}/scopes`,
  /** `GET ?scope=<scope>`: an area's user-scoped data in one request. */
  bootstrap: `${base}/bootstrap`,
  me: {
    /** `GET`: what the caller may do (`AccessDto`: kind, scopes, permissions, roles). Any credential; 401 when signed out. */
    access: `${base}/me/access`,
    /** `GET` (the caller's tokens) and `POST` (create, 201, the only response carrying the plaintext). Session only. */
    tokens: `${base}/me/tokens`,
    /** `DELETE` (revoke, 204). Session only. */
    token: (id: string) => `${base}/me/tokens/${enc(id)}`,
    /** `GET`: the caller's passkeys. Session only. */
    passkeys: `${base}/me/passkeys`,
    /** `DELETE` (204). Session only. */
    passkey: (id: string) => `${base}/me/passkeys/${enc(id)}`,
  },
  webauthn: {
    /** The nuxt-auth-utils passkey registration endpoint (`useWebAuthn({ registerEndpoint })`). */
    register: `${base}/webauthn/register`,
    /** The nuxt-auth-utils passkey sign-in endpoint (`useWebAuthn({ authenticateEndpoint })`). */
    authenticate: `${base}/webauthn/authenticate`,
  },
} as const
