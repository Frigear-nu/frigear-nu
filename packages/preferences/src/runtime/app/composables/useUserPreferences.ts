import type { UserPreferences } from '../../../types'

/**
 * The signed-in user's preferences, typed from every registered definer file.
 *
 *     const { preferences, set } = useUserPreferences()
 *     await set('colorMode', 'dark')
 */
export const useUserPreferences = () => {
  const { user, fetch: refreshSession } = useUserSession()
  const pending = ref(false)

  const preferences = computed<UserPreferences>(() => (user.value?.preferences ?? {}) as UserPreferences)

  function get<K extends keyof UserPreferences>(key: K): UserPreferences[K] | undefined {
    return preferences.value[key]
  }

  /** Saves one preference (`null` clears it) and refreshes the session so `preferences` reflects it. */
  async function set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K] | null) {
    pending.value = true
    try {
      await $fetch('/api/preferences', { method: 'PATCH', body: { [key]: value } })
      await refreshSession()
    }
    finally {
      pending.value = false
    }
  }

  return { preferences, get, set, pending }
}
