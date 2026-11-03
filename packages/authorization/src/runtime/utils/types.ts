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
}

/** The authorization keys that go directly on a `routeRules` entry. */
export const ROUTE_RULE_KEYS = ['roles', 'ability', 'guest', 'authenticated'] as const

/** What `definePageMeta({ authorize })` accepts. `false` opens the page, whatever `routeRules` say. */
export type AuthorizeMeta = string | Ability | RouteRule | false
