/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Ability, AuthorizationResponse, Authorizer, AuthorizerResponse } from './types'

type AbilityFromAuthorizer<A> = A extends (user: infer User, ...args: any[]) => AuthorizerResponse
  ? Ability<User>
  : never

/**
 * Define a policy. The resolved user is injected as the first argument; guests (no user) are denied
 * before the policy runs unless `allowGuest` is set, in which case the policy receives `null`.
 *
 * @example
 * export const editPost = defineAbility((user: User, post: Post) => user.id === post.userId)
 * export const viewFeed = defineAbility({ allowGuest: true }, (user: User | null) => true)
 */
export function defineAbility<A extends Authorizer>(authorizer: A): AbilityFromAuthorizer<A> & Ability
export function defineAbility<A extends Authorizer>(options: { allowGuest: boolean }, authorizer: A): AbilityFromAuthorizer<A> & Ability
export function defineAbility(optionsOrAuthorizer: Authorizer | { allowGuest: boolean }, maybeAuthorizer?: Authorizer): Ability {
  const allowGuest = typeof optionsOrAuthorizer === 'function' ? false : optionsOrAuthorizer.allowGuest
  const original = typeof optionsOrAuthorizer === 'function' ? optionsOrAuthorizer : maybeAuthorizer!

  return {
    allowGuest,
    original,
    execute(user, ...args) {
      if (user === null && !allowGuest) return { authorized: false } satisfies AuthorizationResponse
      return original(user, ...args)
    },
  }
}

export function allow(): AuthorizationResponse {
  return { authorized: true }
}

export function deny(options: { statusCode?: number, message?: string } = {}): AuthorizationResponse {
  return { authorized: false, ...options }
}

export function isAbility(value: unknown): value is Ability {
  return typeof value === 'object' && value !== null && typeof (value as Ability).execute === 'function'
}
