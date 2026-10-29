export interface AuthResolverDefinition {
  name: string
  /** Claims tokens that start with this prefix. */
  prefix?: string
  /** Claims tokens shaped like a JWT (three base64url segments). */
  jwt?: boolean
  /** Path to a module whose default export is an `AuthResolverFn`. */
  resolver: string
  /** Lower runs first. Defaults to 100. */
  order?: number
}

export interface AuthScopeDefinition {
  name: string
  description?: string
  /**
   * Only users whose `role` is one of these may pick (or be granted) the scope. Omit for every user.
   * Policy that is not role based (a host `*:authorize` hook) uses the `auth:scope-available` Nitro hook instead.
   */
  roles?: string[]
}

export interface AuthScopeAvailabilityContext {
  event: import('h3').H3Event
  user: { id: number, role?: string }
  scope: AuthScopeDefinition
  /** Starts `true`; set it to `false` to hide the scope from this user and refuse it on new tokens. */
  available: boolean
}

/**
 * An OAuth provider: any provider nuxt-auth-utils ships (`github`, `auth0`, `okta`, `keycloak`, `oidc`, ...) or `frigear`.
 * See https://github.com/atinux/nuxt-auth-utils#supported-oauth-providers.
 */
export type OAuthProvider = string

/** Overrides for one OAuth provider in `authentication.settings.oauth`. */
export interface OAuthProviderOptions {
  /** Button label. Defaults to the provider's name; `auth.oauth.<provider>.label` translates it per locale. */
  label?: string
  /** Iconify name for the button, e.g. `i-simple-icons-auth0`. */
  icon?: string
  /** Create an account for an email without one. `false` only signs in existing users (invite-only apps). Defaults to `true`. */
  signUp?: boolean
  /** Passed to the nuxt-auth-utils handler (`scope`, `authorizationParams`, ...). Keep secrets in env vars. */
  config?: Record<string, unknown>
}

/** A user API token as the API returns it (`GET /api/auth/me/tokens`): never the hash, dates as ISO strings. */
export interface AuthTokenDto {
  id: string
  name: string
  /** The first characters of the token, to recognise it. */
  prefix: string
  last4: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  status: 'ok' | 'revoked' | 'expired'
}

/** The response to `POST /api/auth/me/tokens`: the only time the plaintext `token` exists. */
export type AuthCreatedTokenDto = AuthTokenDto & { token: string }

/** A passkey as the API returns it (`GET /api/auth/me/passkeys`): never the public key, dates as ISO strings. */
export interface AuthPasskeyDto {
  id: string
  name: string | null
  backedUp: boolean
  transports: string[] | null
  createdAt: string
}

/** A sign-in button, as returned by `GET /api/auth/providers`. */
export interface OAuthProviderButton {
  key: OAuthProvider
  to: string
  label?: string
  icon?: string
  /** Full page navigation instead of the router. */
  external?: boolean
}

/** The subset of `settings` the client reads, exposed through `runtimeConfig.public.authentication`. */
export type PublicModuleOptions = {
  password: boolean
  passwordReset: boolean
  webAuthn: boolean
  magicLink: boolean
  verifyEmail: boolean
  /** Providers enabled in `settings.oauth`. The buttons come from `GET /api/auth/providers`, which also sees env-only ones. */
  oauth: OAuthProvider[]
  /** User API tokens are on (`apiTokens` is not `false`). */
  apiTokens: boolean
  /** Show the "Log in with frigear.nu" button (the route itself re-checks at request time). */
  frigearSso?: boolean
  pages: { login?: string, register?: string }
  /** Where users land after signing in when no `redirect` was requested. */
  afterLogin: string
}

/** Interactive sign-in flows. Everything here is opt-in except password sign-in. */
export interface AuthSettings {
  /** Email/password login and register routes, composables and pages. `false` disables password authentication. Defaults to `true`. */
  password?: boolean
  /** Password reset routes when password authentication is enabled. Defaults to `true`. */
  passwordReset?: boolean
  /**
   * Passwordless sign-in by emailed link (`POST /api/auth/magic-link`). The link opens the `/auth/magic-link` page, whose
   * button signs in (`POST /api/auth/magic-link/confirm`); this also verifies the email address. `signUp: true` creates an account for unknown addresses; `cooldown` is the minimum
   * number of seconds between two links for the same user (default 60).
   */
  magicLink?: boolean | { signUp?: boolean, cooldown?: number }
  /**
   * Requires users who register with email/password to verify their address (through an emailed link) before they can
   * log in. No session is created at registration. Defaults to `false`.
   */
  verifyEmail?: boolean
  /** WebAuthn (passkey) routes, composables and DB table. */
  webAuthn?: boolean
  /**
   * Cron expression for the task removing expired magic links and password resets, or `false` to schedule nothing (the
   * task `auth:clear-expired-tokens` is still registered). Defaults to daily at 03:00.
   */
  cleanup?: string | false
  /**
   * Built-in login/register pages. Each accepts a custom path (string), `true` for the default path, or `false`/omitted
   * to disable. They are built with `@nuxt/ui`, which the host must install. `register` may be an absolute URL (e.g.
   * `https://frigear.nu/sign-up`): the login page links to it and no local register page is registered.
   */
  pages?: {
    login?: string | boolean
    register?: string | boolean
  }
  /**
   * Where users go after signing in (password, passkey, magic link, OAuth/SSO) when no `redirect` was requested.
   * Must be an absolute path on this site. Defaults to `/`.
   */
  afterLogin?: string
  session?: {
    /** Path to a function (default export) mapping the stored user to the session user shape. */
    mapper?: string
  }
  /**
   * OAuth sign-in through nuxt-auth-utils (`GET /api/auth/<provider>`). A provider is on when its credentials are set
   * the way nuxt-auth-utils reads them (`NUXT_OAUTH_<PROVIDER>_CLIENT_ID`, `..._CLIENT_SECRET`, ...), so nothing has to
   * be listed here. List a provider to override its button or sign-up policy, or set it to `false` to keep it off.
   * `frigear` signs in with frigear.nu (OIDC) at `/auth/frigear` and has to be enabled here; it is active when
   * `runtimeConfig.previewDeployment` is true or `runtimeConfig.frigear.sso` is configured.
   */
  oauth?: Record<OAuthProvider, boolean | OAuthProviderOptions>
}

export interface ModuleOptions {
  /**
   * User API tokens (`Authorization: Bearer <prefix>…`), created on the account page or through `/api/auth/me/tokens`.
   * `false` turns them off: no token routes, and bearer tokens with the prefix are no longer resolved. Defaults to `true`.
   */
  apiTokens?: boolean | {
    /** What every new token starts with (letters, digits, `_` and `-`). Changing it invalidates issued tokens. Defaults to `fnu_`. */
    prefix?: string
  }
  /** Default lifetime in days for new user tokens; `null`/omitted means they never expire. */
  tokenTtlDays?: number | null
  /** Path to a module whose default export is an `AuthUserStore` (overrides the one registered by `@frigear-nu/users`). */
  userStore?: string
  /** Scopes registered by the host application. Modules register theirs with `addAuthScope`. */
  scopes?: AuthScopeDefinition[]
  settings?: AuthSettings
}
