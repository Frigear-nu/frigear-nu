import type { H3Event } from 'h3'
import type { Ability, AbilityArgs } from '../../utils'
import { allows as _allows, denies as _denies, authorize as _authorize, AuthorizationError, splitResolvedUser } from '../../utils'
import resolveServerUser from '#authorization/server-resolver'

/** Resolve the current user with the configured server resolver (session user by default). */
export async function resolveAuthorizationUser(event: H3Event) {
  return splitResolvedUser(await resolveServerUser(event)).user
}

export async function allows<A extends Ability>(event: H3Event, ability: A, ...args: AbilityArgs<A>): Promise<boolean> {
  return _allows(ability, await resolveAuthorizationUser(event), ...args)
}

export async function denies<A extends Ability>(event: H3Event, ability: A, ...args: AbilityArgs<A>): Promise<boolean> {
  return _denies(ability, await resolveAuthorizationUser(event), ...args)
}

/** Throws an h3 error (401 for guests, 403 otherwise) when the user may not perform the action. */
export async function authorize<A extends Ability>(event: H3Event, ability: A, ...args: AbilityArgs<A>): Promise<void> {
  try {
    await _authorize(ability, await resolveAuthorizationUser(event), ...args)
  }
  catch (error) {
    if (error instanceof AuthorizationError) {
      throw createError({ statusCode: error.statusCode, message: error.message })
    }
    throw error
  }
}
