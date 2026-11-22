import { definitions } from '#preferences/definitions'
import type { StoredUserPreferences } from '../../../types'
import { readPreference, resolvePreferences } from '../../utils/registry'
import type { ResolvedPreference } from '../../utils/registry'

let registry: Map<string, ResolvedPreference> | undefined

/** Every registered preference, keyed by name. */
export function getPreferenceRegistry(): Map<string, ResolvedPreference> {
  return registry ??= resolvePreferences(definitions)
}

/**
 * A typed preference of a user (the session user or a database row), or `undefined` when it was never set or no
 * longer satisfies its schema. A `managed` key is never in the session: read it from the user row.
 *
 *     getUserPreference(user, 'colorMode') // 'light' | 'dark' | 'system' | undefined
 */
export function getUserPreference<K extends keyof StoredUserPreferences & string>(
  user: { preferences?: unknown } | null | undefined,
  key: K,
): StoredUserPreferences[K] | undefined {
  return readPreference(getPreferenceRegistry(), user?.preferences, key) as StoredUserPreferences[K] | undefined
}
