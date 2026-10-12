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

export type AuthUserLoader = (id: string) => Promise<AuthUser | null>
