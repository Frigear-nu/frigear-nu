// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).

/** The preferences API. */
export const preferencesApi = {
  /** `PATCH { [key]: value | null }` (session only): sets (or clears with `null`) preferences, answers the stored preferences. */
  root: '/api/preferences',
} as const
