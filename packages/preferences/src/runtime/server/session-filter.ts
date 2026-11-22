import { getPreferenceRegistry } from './utils/preferences'

// A session user filter of `@frigear-nu/auth` (registered in `module.ts`): `managed` preferences (the notification
// channels) stay on `users.preferences` but out of the sealed session cookie and `useUserSession()`. Their module reads
// them from the database through its own routes, so they can grow without filling the cookie.
export default function dropManagedPreferences(user: Record<string, unknown>): Record<string, unknown> {
  const preferences = user.preferences
  if (!preferences || typeof preferences !== 'object') return user
  const registry = getPreferenceRegistry()
  const kept = Object.fromEntries(Object.entries(preferences).filter(([key]) => !registry.get(key)?.managed))
  return { ...user, preferences: kept }
}
