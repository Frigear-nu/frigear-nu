import type { z } from 'zod'

/**
 * One preference: a zod schema, or a schema plus how it is exposed.
 *
 * - `claim` forwards the value to OAuth applications under that claim name (ID token and `userinfo`).
 *   Nothing is forwarded without it, so a preference stays private to this app unless it opts in.
 * - `scope` is the OAuth scope an application must have been granted to receive the claim (default `profile`).
 * - `managed` hands the value to the module that registered it: it is written only through that module's own routes,
 *   and `PATCH /api/preferences` refuses the key (400 `preference_managed`).
 */
export type PreferenceDefinition<S extends z.ZodType = z.ZodType>
  = S | { schema: S, claim?: string, scope?: string, managed?: boolean }

export type PreferenceDefinitions = Record<string, PreferenceDefinition>

/** The schema of a definition, whichever of the two shapes it was written in. */
export type PreferenceSchema<D>
  = D extends z.ZodType ? D
    : D extends { schema: infer S extends z.ZodType } ? S
      : never

/** The keys of `T` declared `managed: true`. */
export type ManagedPreferenceKeys<T extends PreferenceDefinitions> = {
  [K in keyof T]: T[K] extends { managed: true } ? K : never
}[keyof T]

/**
 * `{ key: value }` as the preferences of a user: every key is optional because a user may not have chosen yet. `managed`
 * keys are left out: `PATCH /api/preferences` refuses them and the session never carries them, so `useUserPreferences()`
 * can neither `set` nor `get` them. Their module reads and writes them through its own routes.
 */
export type PreferencesOf<T extends PreferenceDefinitions> = {
  [K in Exclude<keyof T, ManagedPreferenceKeys<T>>]?: z.output<PreferenceSchema<T[K]>>
}

/** `{ key: value }` of the `managed` keys of `T` only: the counterpart of `PreferencesOf`. */
export type ManagedPreferencesOf<T extends PreferenceDefinitions> = {
  [K in ManagedPreferenceKeys<T>]?: z.output<PreferenceSchema<T[K]>>
}

/**
 * Declares preferences. A definer file default-exports the result, and is registered with
 * `addUserPreferences(nuxt, { path })` or listed in the module's `definitions` option. Its keys and value types
 * become `UserPreferences`, so the schema is the single source of truth for validation and typing.
 *
 *     // shared/preferences.ts
 *     export default definePreferences({
 *       // plain schema: stored and readable by this app only
 *       compactTables: z.boolean(),
 *       // forwarded to OAuth applications as `color_mode`
 *       colorMode: { schema: z.enum(['light', 'dark', 'system']), claim: 'color_mode' },
 *     })
 */
export const definePreferences = <const T extends PreferenceDefinitions>(definitions: T): T => definitions
