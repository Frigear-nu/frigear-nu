import type { Ability, AbilityArgs } from '../../utils'
import { allows as _allows, denies as _denies, authorize as _authorize, AuthorizationError } from '../../utils'
import resolveClientUser from '#build/authorization/client-resolver.mjs'
import { createError } from '#imports'

/** Check whether the current (client-resolved) user may perform an action. */
export async function allows<A extends Ability>(ability: A, ...args: AbilityArgs<A>): Promise<boolean> {
  return _allows(ability, await resolveClientUser(), ...args)
}

export async function denies<A extends Ability>(ability: A, ...args: AbilityArgs<A>): Promise<boolean> {
  return _denies(ability, await resolveClientUser(), ...args)
}

/** Throws a Nuxt error (403 by default) when the current user may not perform the action. */
export async function authorize<A extends Ability>(ability: A, ...args: AbilityArgs<A>): Promise<void> {
  try {
    await _authorize(ability, await resolveClientUser(), ...args)
  }
  catch (error) {
    if (error instanceof AuthorizationError) {
      throw createError({ statusCode: error.statusCode, message: error.message })
    }
    throw error
  }
}

export function useAuthorization() {
  return { allows, denies, authorize }
}
