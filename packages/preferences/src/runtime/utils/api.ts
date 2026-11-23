// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).

/** The preferences API. */
export const preferencesApi = {
  /** `PATCH { [key]: value | null }` (session only): sets (or clears with `null`) preferences, answers the stored preferences. */
  root: '/api/preferences',
  /**
   * `GET` every notification topic with the caller's channels; `PATCH { topics: { [id]: { email?, sms?, push? } } }`
   * changes some of them and answers the same. `preferences:notifications`: a session, or a token given it.
   */
  notifications: '/api/preferences/notifications',
} as const
