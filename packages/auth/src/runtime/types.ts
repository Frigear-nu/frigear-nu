import type { H3Event } from 'h3'

// Runtime-side types. They live outside `src/types.ts` (the module entry types) on purpose: they refer
// to nuxt-auth-utils' virtual `#auth-utils` module, which the types bundler cannot resolve. Import them
// from `@frigear-nu/auth/utils`.

/** The signed-in user as seen by routes: the nuxt-auth-utils `User` (augmentable by the host). */
export type AuthUser = import('#auth-utils').User

export interface AuthTokenInfo {
  id: string
  name: string
  prefix: string
}

interface AuthPrincipalBase {
  user: AuthUser
  /** What this credential may do. A session holds all of its user's permissions; a token the scopes it was given. */
  scopes: string[]
  /**
   * The user's current permissions, when access control is on (`auth:user-permissions`). A bearer credential only
   * acts within them, so a token keeps no right its user has since lost. `undefined`: no cap.
   */
  ceiling?: string[]
}

/** Who is calling, and how. Set on `event.context.auth` by `getAuth`. */
export type AuthPrincipal
  = | (AuthPrincipalBase & { kind: 'session' })
    | (AuthPrincipalBase & { kind: 'user-token', token: AuthTokenInfo })
    | (AuthPrincipalBase & { kind: 'oauth', client: { id: string } })

export type AuthPrincipalKind = AuthPrincipal['kind']

export interface RequireUserOptions {
  /** Scopes the credential must carry (within its user's permissions, when access control is on). */
  scopes?: string[]
  /** Reject bearer credentials (user tokens, OAuth access tokens). Use for account-level actions. */
  sessionOnly?: boolean
}

/** Turns a bearer token into a principal, or `null` when the token is not valid. */
export type AuthResolverFn = (event: H3Event, token: string) => Promise<AuthPrincipal | null>

/** A user as the store keeps it, credentials included. Never put one in a session or a response as is: use `mapUserToSession`. */
export interface AuthStoredUser {
  id: number
  name: string
  email: string
  avatar?: string | null
  password?: string | null
  emailVerifiedAt?: Date | null
  lastLoginAt?: Date | null
  /** Bumped to end every session of the user (`endAuthSessions`); a session is stamped with it at sign-in. */
  sessionVersion?: number
  [key: string]: unknown
}

export interface AuthUserCreate {
  /** Only for identity providers that dictate the local id (`frigear.forceId`). */
  id?: number
  name: string
  email: string
  avatar?: string
  password?: string
  emailVerifiedAt?: Date
  /** Only with a roles column on `users` (`@frigear-nu/authorization`); set by identity providers that dictate it. */
  role?: string
}

export type AuthUserUpdate = Partial<Pick<AuthStoredUser, 'name' | 'email' | 'avatar' | 'password' | 'emailVerifiedAt' | 'lastLoginAt' | 'sessionVersion'>> & { role?: string }

/**
 * Where the sign-in flows read and write users. `@frigear-nu/users` provides it (`setAuthUserStore`); a host without
 * that module can supply its own with `authentication.userStore`.
 */
export interface AuthUserStore {
  /** Accepts the text ids of tokens; resolves `null` for ids that are not a user. */
  findById: (id: string | number) => Promise<AuthStoredUser | null>
  findByEmail: (email: string) => Promise<AuthStoredUser | null>
  create: (values: AuthUserCreate) => Promise<AuthStoredUser>
  update: (id: number, values: AuthUserUpdate) => Promise<AuthStoredUser | null>
  remove: (id: number) => Promise<void>
  /**
   * Gives the user a new id, taking everything that references it along. A different user holding `to` is moved to the
   * next free id first. Used by identity providers that dictate the local id (`frigear.forceId`).
   */
  changeId: (from: number, to: number) => Promise<void>
}

// ---------------------------------------------------------------------------------------------------------------------
// Access control contracts (`utils/permissions.ts` holds the vocabulary and the pure decision core).
// ---------------------------------------------------------------------------------------------------------------------

/** Where a stored role row came from. Single sign-on only ever replaces its own (`sso`) rows. */
export type AuthRoleSource = 'manual' | 'sso' | 'migrated'

/**
 * The contract between auth and the module that owns roles (`@frigear-nu/authorization`), served as `#auth/roles`.
 * Without that module it is a no-op: no roles, `setRoles` does nothing, no `roleScopes` cap.
 */
export interface AuthRoleProvider {
  /**
   * The user's effective roles: assigned ∪ `defaultRoles` ∪ `auto` ∪ `authorization:roles`, without the roles whose
   * requirements fail, closed over `inherit`. Cached per request.
   */
  getRoles: (event: H3Event, user: AuthUser) => Promise<string[]>
  /** Replaces the user's roles of one `source` (single sign-on passes `sso` and never touches manual rows). */
  setRoles: (userId: number | string, roles: readonly string[], options: { source: AuthRoleSource, grantedBy?: number | string | null }) => Promise<void>
  /**
   * The scopes the user may give a client: the union of `oauthServer.settings.roleScopes` over their effective roles.
   * `undefined`: no cap beyond permissions.
   */
  getRoleScopes: (event: H3Event, user: AuthUser) => Promise<string[] | undefined>
}

/**
 * The `authorization:before` Nitro hook (≈ Laravel's `Gate::before`), the single host override. Listeners vote with
 * `allow()` or `deny()`; any deny (or a listener that throws) denies, otherwise any allow allows and skips roles and
 * policies. It runs after the credential checks, so it can never widen a token or a session-only permission.
 */
export interface AuthorizationBeforeContext {
  event: H3Event
  principal: AuthPrincipal
  /** The principal's user; identify the caller from this, never from the session on `event` (empty for bearers). */
  user: AuthUser
  permission: string
  /** The record a policy check is about, when there is one. */
  record: unknown
  allow: () => void
  deny: () => void
}

/**
 * The `authorization:roles` Nitro hook (`@frigear-nu/authorization`): add roles to `ctx.roles` from outside the
 * database, such as an environment allowlist. Hook roles still pass their requirements.
 */
export interface AuthorizationRolesContext {
  event: H3Event
  user: AuthUser
  roles: string[]
}
