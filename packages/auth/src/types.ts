import type { AuthMode } from './runtime/mode'
import type { AuthClientPublicConfig, ClientModuleOptions } from './runtime/client/types'

export type { AuthMode } from './runtime/mode'
export type {
  AuthAppConfig,
  AuthClientPublicConfig,
  AuthStatus,
  ClientModuleOptions,
  StorageMode,
  StorageOption,
} from './runtime/client/types'

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
   * The junior-most roles this permission belongs to (role-based access control, `@frigear-nu/authorization`): every
   * role that inherits one of them gets it too. `['user']` gives it to every signed-in user. Omit it and only `admin`
   * holds the permission (default deny). Like Kubernetes' aggregated roles: a module grants its own permissions without
   * the host listing them.
   */
  aggregateTo?: string[]
  /**
   * A permission only a cookie session uses (creating users, managing OAuth applications): roles can hold it, but it
   * is never offered to API tokens or OAuth clients, nor listed as a supported OAuth scope.
   */
  sessionOnly?: boolean
  /**
   * Without `@frigear-nu/authorization` roles: only users whose `role` is one of these may pick (or be granted) the
   * scope. With them, it is read as `aggregateTo` when that is not set.
   * @deprecated Use `aggregateTo`.
   */
  roles?: string[]
}

/**
 * A role a module ships (`addAuthRole`), merged with the built-in and the host's roles by `@frigear-nu/authorization`.
 */
export interface AuthRoleDefinition {
  /** Stored in `users.role`. */
  name: string
  label?: string
  description?: string
  /** Roles whose permissions this role also gets (role hierarchy). Defaults to `['user']`. */
  inherits?: string[]
  /** Roles that inherit this one (it slots in below them). Defaults to `['admin']`. */
  inheritedBy?: string[]
  /** Permissions granted directly: registered scope names or `resource:*` wildcards. */
  permissions?: string[]
}

/** The `auth:user-permissions` Nitro hook: what a user may do, decided by the access-control module. */
export interface AuthUserPermissionsContext {
  event: import('h3').H3Event
  /** The user as stored (with `role` when `@frigear-nu/authorization` adds it). */
  user: { id: number, role?: string | null, [key: string]: unknown }
  /**
   * Starts `null`: no access control, the user may do everything (`*`). A listener sets the user's permissions
   * (scope names and `resource:*` wildcards); every credential of the user is then capped by them.
   */
  permissions: string[] | null
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
  /**
   * Treat the email this provider returns as verified even though it sends no verification flag (Facebook, Microsoft,
   * Spotify, ...). Only for providers that never hand out an address its user does not own: a sign-in links to the
   * local account with that email. Defaults to `false`: without a positive flag (`email_verified`, Discord's
   * `verified`) the sign-in is refused.
   */
  trustEmail?: boolean
  /** Passed to the nuxt-auth-utils handler (`scope`, `authorizationParams`, ...). Keep secrets in env vars. */
  config?: Record<string, unknown>
  /**
   * Keep the provider's access and refresh tokens (encrypted, in `auth_oauth_tokens`) at every login, to call the
   * provider as the user with `getOAuthAccessToken`. Adds the table. Defaults to `false`.
   */
  keepTokens?: boolean
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
  mode: AuthMode
  /** All `false` in client mode. */
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
  /**
   * The anonymous entry points Auth owns (sign-in pages, the callback, `/api/auth/**`), as route patterns. Route guards
   * always let them through.
   */
  publicPaths: string[]
  /** Client mode only. */
  client?: AuthClientPublicConfig
}

/** Interactive sign-in flows. Everything here is opt-in except password sign-in. */
export interface AuthSettings {
  /** Email/password login and register routes, composables and pages. `false` disables password authentication. Defaults to `true`. */
  password?: boolean
  /**
   * Password reset routes when password authentication is enabled. Defaults to `true`. `cooldown` is the minimum number
   * of seconds between two reset emails for the same user (default 60).
   */
  passwordReset?: boolean | { cooldown?: number }
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
  /**
   * Throttling of the anonymous sign-in routes, counted in NuxtHub KV (`hub.kv`; without it nothing is throttled and the
   * build warns). Past a limit a route answers `429 rate_limited` with `retry-after`. `0` turns one limit off, `false`
   * all of them. Off under `nuxt dev`.
   */
  rateLimit?: false | {
    /** Length of the fixed window, in seconds. Defaults to 900 (15 minutes). */
    windowSeconds?: number
    /** Failed password sign-ins per client IP and account. Defaults to 10. */
    login?: number
    /** Failed password sign-ins per client IP, for any account. Defaults to 100. */
    loginIp?: number
    /** Requests per client IP to each of register, forgot-password, magic-link and the passkey routes. Defaults to 30. */
    requests?: number
    /**
     * Request header holding the client IP set by the platform in front of the app. Defaults to `cf-connecting-ip` on
     * the Cloudflare presets, else none (the socket address).
     */
    ipHeader?: string
    /** Read the client IP from `X-Forwarded-For`, which any client can set. Only behind a proxy that overwrites it. Defaults to `false`. */
    xForwardedFor?: boolean
  }
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
    /** Client mode only: the page the issuer redirects back to (at `client.callbackPath`). Defaults to `true`. */
    callback?: boolean
  }
  /**
   * The public URL of the site, which emailed links (password reset, magic links, email verification and changes)
   * point at. Becomes `runtimeConfig.public.siteUrl`, which `NUXT_PUBLIC_SITE_URL` sets at runtime; defaults to
   * `NUXT_SITE_URL` at build time. Required in production unless `trustRequestOrigin` is on.
   */
  siteUrl?: string
  /**
   * Without a site URL, build emailed links from the request's origin in production too. Only for platforms that
   * route requests by host, so a request for another host never reaches the app (Cloudflare Workers). Defaults to
   * `false`: without a site URL those emails fail with a 500 (`nuxt dev` always uses the request origin).
   */
  trustRequestOrigin?: boolean
  /**
   * Where users go after signing in (password, passkey, magic link, OAuth/SSO) when no `redirect` was requested.
   * Must be an absolute path on this site. Defaults to `/`.
   */
  afterLogin?: string
  session?: {
    /** Path to a function (default export) mapping the stored user to the session user shape. */
    mapper?: string
    /**
     * How long a cookie session lasts, in seconds from sign-in: the cookie expires and the server refuses the session
     * after it. Defaults to 30 days. `false` turns the limit off. `runtimeConfig.session.maxAge` (nuxt-auth-utils,
     * `NUXT_SESSION_MAX_AGE`) wins over it.
     */
    maxAge?: number | false
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
   * `server` (default): sign-in on this app's server, with a cookie session. `client`: a public OAuth client (PKCE)
   * for SPAs and Capacitor apps that signs in at `client.issuer`, with no server or database. Set it in the app's own
   * config; it cannot come from another module.
   */
  mode?: AuthMode
  /** Client mode: the issuer and how this app talks to it. */
  client?: ClientModuleOptions
  /**
   * User API tokens (`Authorization: Bearer <prefix>…`), created on the account page or through `/api/auth/me/tokens`.
   * `false` turns them off: no token routes, and bearer tokens with the prefix are no longer resolved. Defaults to `true`.
   */
  apiTokens?: boolean | {
    /** What every new token starts with (letters, digits, `_` and `-`). Changing it invalidates issued tokens. Defaults to `fnu_`. */
    prefix?: string
    /**
     * Revoke all of a user's tokens when their password is reset by email or an email change is undone from the old
     * address: both mean the account may have been in someone else's hands. Defaults to `true`; `false` keeps them
     * (integrations then keep working, and so would tokens someone else minted).
     */
    revokeOnReset?: boolean
  }
  /** Default lifetime in days for new user tokens; `null`/omitted means they never expire. */
  tokenTtlDays?: number | null
  /** Path to a module whose default export is an `AuthUserStore` (overrides the one registered by `@frigear-nu/users`). */
  userStore?: string
  /** Scopes registered by the host application. Modules register theirs with `addAuthScope`. */
  scopes?: AuthScopeDefinition[]
  settings?: AuthSettings
}
