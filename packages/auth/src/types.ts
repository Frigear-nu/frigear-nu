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

export const OAUTH_PROVIDERS = ['github', 'google', 'facebook', 'frigear'] as const
export type OAuthProvider = typeof OAUTH_PROVIDERS[number]

/** The subset of `settings` the client reads, exposed through `runtimeConfig.public.authentication`. */
export type PublicModuleOptions = {
  password: boolean
  passwordReset: boolean
  webAuthn: boolean
  magicLink: boolean
  verifyEmail: boolean
  oauth: OAuthProvider[]
  /** Show the "Log in with frigear.nu" button (the route itself re-checks at request time). */
  frigearSso?: boolean
  pages: { login?: string, register?: string }
}

/** Interactive sign-in flows. Everything here is opt-in except password sign-in. */
export interface AuthSettings {
  /** Email/password login and register routes, composables and pages. `false` disables password authentication. Defaults to `true`. */
  password?: boolean
  /** Password reset routes when password authentication is enabled. Defaults to `true`. */
  passwordReset?: boolean
  /**
   * Passwordless sign-in by emailed link (`POST /api/auth/magic-link`, `GET /auth/magic-link`). Following the link also
   * verifies the email address. `signUp: true` creates an account for unknown addresses; `cooldown` is the minimum
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
  session?: {
    /** Path to a function (default export) mapping the stored user to the session user shape. */
    mapper?: string
  }
  /**
   * The "simple" OAuth routes we ship (e.g. `/api/auth/github`). Client id/secret are configured the way
   * nuxt-auth-utils expects (env vars). `frigear` signs in with frigear.nu (OIDC) and is only active when
   * `runtimeConfig.previewDeployment` is true or `runtimeConfig.frigear.sso` is configured.
   */
  oauth?: Partial<Record<OAuthProvider, boolean>>
}

export interface ModuleOptions {
  /** Default lifetime in days for new user tokens; `null`/omitted means they never expire. */
  tokenTtlDays?: number | null
  /** Path to a module whose default export is an `AuthUserStore` (overrides the one registered by `@frigear-nu/users`). */
  userStore?: string
  /** Scopes registered by the host application. Modules register theirs with `addAuthScope`. */
  scopes?: AuthScopeDefinition[]
  settings?: AuthSettings
}
