import type { Ability, AbilityArgs } from '../../utils'
import { allows as _allows, denies as _denies, authorize as _authorize, AuthorizationError } from '../../utils'
import { holdsScopes } from '../../utils/rules'
import { roleOf } from '../../utils/rbac'
import type { PublicRbacTable } from '../../../types'
import resolveClientUser from '#build/authorization/client-resolver.mjs'
import { createError, useRuntimeConfig } from '#imports'

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

/**
 * Whether the current user's role holds every permission (role-based access control, `rbac: true`): scope names,
 * `resource:*` wildcards; a `:pii` permission only by name. Without `rbac` every signed-in user may do everything. For
 * what the UI shows: the API decides what is allowed.
 */
export async function can(permission: string | string[]): Promise<boolean> {
  const user = await resolveClientUser() as { role?: string | null } | null
  if (!user) return false
  const rbac = (useRuntimeConfig().public as { authorization?: { rbac?: PublicRbacTable } }).authorization?.rbac
  if (!rbac) return true
  return holdsScopes(roleOf(rbac, user.role).permissions, Array.isArray(permission) ? permission : [permission])
}

export function useAuthorization() {
  return { allows, denies, authorize, can }
}
