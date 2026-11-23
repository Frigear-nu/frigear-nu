export type {
  PreferenceDefinition,
  PreferenceDefinitions,
  PreferenceSchema,
  PreferencesOf,
} from './runtime/define'

export type ModuleOptions = {
  /**
   * Files that default-export `definePreferences({...})`, resolved from the project root. A `shared/preferences.ts`
   * is picked up on its own. Other modules register theirs with `addUserPreferences`.
   */
  definitions?: string | string[]
  pages?: {
    /**
     * The account page where users choose their channels per notification topic (`notifyUser` of
     * `@frigear-nu/notify`). `true` mounts it at `/account/notifications` (the default), a string at that path, `false`
     * leaves it out.
     */
    notifications?: string | boolean
  }
}

/** Public runtime config (`runtimeConfig.public.preferences`). */
export type PreferencesPublicConfig = {
  pages: { notifications?: string }
}

/**
 * The preferences of a user, keyed by name. This is filled in by the generated types from every registered
 * definer file, so `preferences.colorMode` is `'light' | 'dark' | 'system' | undefined` and a misspelled key
 * does not compile.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UserPreferences {}

/**
 * The `managed` preferences of a user (filled in like `UserPreferences`). They are left out of `UserPreferences`, so
 * `useUserPreferences()` cannot `set` or `get` them: only their module's own routes write them and the session never
 * carries them. Server code reads them from the user row with `getUserPreference`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ManagedUserPreferences {}

/** Every stored preference of a user, `managed` ones included, as the user row holds them. */
export type StoredUserPreferences = UserPreferences & ManagedUserPreferences

/** The response of `PATCH /api/preferences`: the preferences now stored for the caller. */
export type PreferencesDto = StoredUserPreferences
