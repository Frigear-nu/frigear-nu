// Policy signatures are intentionally loose (`any`): the user and argument types are inferred per ability.
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Detailed outcome of an ability check. Lets an ability customise the error that is thrown on denial.
 */
export interface AuthorizationResponse {
  authorized: boolean
  statusCode?: number
  message?: string
}

export type AuthorizerResponse = boolean | AuthorizationResponse | Promise<boolean | AuthorizationResponse>

/** A policy function: receives the resolved user first, then any call-site arguments. */
export type Authorizer<User = any> = (user: User, ...args: any[]) => AuthorizerResponse

export interface Ability<User = any> {
  allowGuest: boolean
  original: Authorizer<User>
  execute: (user: User | null, ...args: any[]) => AuthorizerResponse
}

/** Call-site arguments of an ability, inferred from the policy signature. */
export type AbilityArgs<A extends Ability> = A extends { original: (user: any, ...args: infer Args) => AuthorizerResponse } ? Args : never

/** Declarative rule: the keys of a `routeRules` entry, or the object form of `definePageMeta({ authorize })`. */
export interface RouteRule {
  /** Allowed roles (matched against `user.role`). */
  roles?: string[]
  /** Name of an exported ability from the abilities file, or (page meta only) an ability object. */
  ability?: string | Ability
  /** Arguments passed to the ability (page meta only - config rules cannot carry arguments). */
  args?: unknown[]
  /** Let unauthenticated visitors through (the ability/roles checks still apply). */
  guest?: boolean
  /** `true`: require a logged-in user. `false`: no authorization at all (opens a sub-route of a protected pattern). */
  authenticated?: boolean
  /**
   * Scopes a bearer credential (user API token, OAuth access token) must carry. Sessions carry every scope. A rule
   * that lists scopes lets bearer credentials through (they still have to match `roles`/`ability`).
   */
  scopes?: string[]
  /**
   * `true`: only cookie sessions pass, bearer credentials get a 403. Defaults to `true` for a rule with `roles` or
   * `ability` and no `scopes`, and to `false` otherwise (a plain `authenticated: true` accepts any credential).
   * Set `false` on a `roles`/`ability` rule to let bearer credentials with any scopes through.
   */
  sessionOnly?: boolean
}

/** Who presented the credential: what `getAuth` from `@frigear-nu/auth` reports. Absent means a cookie session. */
export interface RuleCredential {
  kind: string
  scopes: readonly string[]
  /** The user's current permissions, when role-based access control is on (`@frigear-nu/auth`'s principal). */
  ceiling?: readonly string[]
}

/** The authorization keys that go directly on a `routeRules` entry. */
export const ROUTE_RULE_KEYS = ['roles', 'ability', 'guest', 'authenticated', 'scopes', 'sessionOnly'] as const

/** What `definePageMeta({ authorize })` accepts. `false` opens the page, whatever `routeRules` say. */
export type AuthorizeMeta = string | Ability | RouteRule | false
