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

/** Who is calling, and how. Set on `event.context.auth` by `getAuth`. */
export type AuthPrincipal
  = | { kind: 'session', user: AuthUser, scopes: string[] }
    | { kind: 'user-token', user: AuthUser, scopes: string[], token: AuthTokenInfo }
    | { kind: 'oauth', user: AuthUser, scopes: string[], client: { id: string } }

export type AuthPrincipalKind = AuthPrincipal['kind']

export interface RequireUserOptions {
  /** Scopes the credential must carry. Sessions carry every scope. */
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
}

export type AuthUserUpdate = Partial<Pick<AuthStoredUser, 'name' | 'email' | 'avatar' | 'password' | 'emailVerifiedAt' | 'lastLoginAt'>>

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
