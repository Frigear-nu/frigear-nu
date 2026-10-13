import { definitions } from '#preferences/definitions'
import type { UserPreferences } from '../../../types'
import { readPreference, resolvePreferences } from '../../utils/registry'
import type { ResolvedPreference } from '../../utils/registry'

let registry: Map<string, ResolvedPreference> | undefined

/** Every registered preference, keyed by name. */
export function getPreferenceRegistry(): Map<string, ResolvedPreference> {
  return registry ??= resolvePreferences(definitions)
}

/**
 * A typed preference of a user (the session user or a database row), or `undefined` when it was never set or no
 * longer satisfies its schema.
 *
 *     getUserPreference(user, 'colorMode') // 'light' | 'dark' | 'system' | undefined
 */
export function getUserPreference<K extends keyof UserPreferences & string>(
  user: { preferences?: unknown } | null | undefined,
  key: K,
): UserPreferences[K] | undefined {
  return readPreference(getPreferenceRegistry(), user?.preferences, key) as UserPreferences[K] | undefined
}
