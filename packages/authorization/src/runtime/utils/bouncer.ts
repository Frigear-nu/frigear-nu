import { createAuthorizationError } from './error'
import type { Ability, AbilityArgs, AuthorizationResponse } from './types'

export function normalizeResponse(result: boolean | AuthorizationResponse): AuthorizationResponse {
  return typeof result === 'boolean' ? { authorized: result } : result
}

/** Run an ability for an already-resolved user. Used by the client and server helpers. */
export async function check<A extends Ability>(ability: A, user: unknown, ...args: AbilityArgs<A>): Promise<AuthorizationResponse> {
  return normalizeResponse(await ability.execute(user ?? null, ...args))
}

export async function allows<A extends Ability>(ability: A, user: unknown, ...args: AbilityArgs<A>): Promise<boolean> {
  return (await check(ability, user, ...args)).authorized
}

export async function denies<A extends Ability>(ability: A, user: unknown, ...args: AbilityArgs<A>): Promise<boolean> {
  return !(await allows(ability, user, ...args))
}

export async function authorize<A extends Ability>(ability: A, user: unknown, ...args: AbilityArgs<A>): Promise<void> {
  const response = await check(ability, user, ...args)
  if (!response.authorized) throw createAuthorizationError(response.message, response.statusCode)
}
