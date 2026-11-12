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
  /** A bearer credential's scopes, as granted. Always empty for a session: check access with `authorize` / `allows`. */
  scopes: string[]
  /**
   * A bearer credential's permissions: frozen when it was issued (the `permissions` of a user token row or an access
   * token's claim), or for older credentials its expanded scopes intersected with its user's permissions at request
   * time. Step 4 of `authorize` checks it. Not set on a session.
   */
  permissions?: string[]
  /**
   * A token from a foreign issuer (`@frigear-nu/oauth-resource`): its `permissions` replace the user's roles, since
   * this app knows nothing about the user.
   */
  foreign?: boolean
}

/** Who is calling, and how. Set on `event.context.auth` by `getAuth`. */
export type AuthPrincipal
  = | (AuthPrincipalBase & { kind: 'session' })
    | (AuthPrincipalBase & { kind: 'user-token', token: AuthTokenInfo })
    | (AuthPrincipalBase & { kind: 'oauth', client: { id: string } })

export type AuthPrincipalKind = AuthPrincipal['kind']

export interface RequireUserOptions {
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
 * The contract between auth and the module that stores role assignments (`@frigear-nu/authorization`), registered with
 * `setRoleProvider` and served as `provider` from `#auth/roles`. Without one, no user has an assigned role: only the
 * `defaultRoles`, `auto` roles, `authorization:roles` and `implicit` permissions count.
 */
export interface AuthRoleProvider {
  /** The roles stored for the user (assigned, single sign-on, migrated). Auth adds defaults, `auto` and hook roles. */
  getAssignedRoles: (event: H3Event | undefined, userId: number) => Promise<string[]>
  /** Replaces the user's roles of one `source` only (single sign-on passes `sso` and never touches manual rows). */
  setRoles: (userId: number, roles: string[], options: { source: AuthRoleSource, grantedBy?: number }) => Promise<void>
}

/** What a role requirement (`addRoleRequirement`) decides on. */
export interface AuthRoleRequirementContext {
  event: H3Event | undefined
  user: AuthUser
  /** The role's value for this requirement (`requirements: { subscription: '*' }` -> `'*'`). */
  value: unknown
}

/** A role requirement: the default export of an `addRoleRequirement` file. Throwing counts as not met. */
export type AuthRoleRequirement = (ctx: AuthRoleRequirementContext) => boolean | Promise<boolean>

/**
 * The `authorization:before` Nitro hook (≈ Laravel's `Gate::before`), the single host override. Listeners vote with
 * `allow()` or `deny()`; any deny (or a listener that throws) denies, otherwise any allow allows and skips roles and
 * policies. It runs after the credential checks, so it can never widen a token or a session-only permission.
 *
 * A listener that needs what the user may otherwise do calls `subjectAllowed`, never `allows` / `authorize` on the same
 * permission: those fire this hook again (endless recursion).
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
 * The `authorization:roles` Nitro hook, fired by auth while it resolves a user's roles: add roles to `ctx.roles` from outside the
 * database, such as an environment allowlist. Hook roles still pass their requirements.
 */
export interface AuthorizationRolesContext {
  /** Missing when roles are resolved outside a request. */
  event: H3Event | undefined
  user: AuthUser
  /** Assigned, default and `auto` roles so far: push to add, splice to remove. A listener that throws leaves no roles. */
  roles: string[]
}
