import type { StoredUserPreferences, UserPreferences } from '@frigear-nu/preferences'

// Compile-time checks run by `pnpm test:types`: the keys and value types come from `shared/preferences.ts`.
const ok: UserPreferences = { colorMode: 'dark', compactTables: true, pageSize: 50 }

// @ts-expect-error - not one of the schema's values
const badValue: UserPreferences = { colorMode: 'neon' }
// @ts-expect-error - not a registered preference
const badKey: UserPreferences = { unknown: true }
// @ts-expect-error - `managed` (notify's channel choices): only its own route writes it, and the session never has it
const managedKey: UserPreferences = { notificationChannels: {} }

type SettableKey = Parameters<ReturnType<typeof useUserPreferences>['set']>[0]
const settable: SettableKey = 'colorMode'
// @ts-expect-error - `set` / `get` do not accept a managed key
const notSettable: SettableKey = 'notificationChannels'

// The user row holds the managed keys too: server code reads them with `getUserPreference`.
const stored: StoredUserPreferences = { colorMode: 'dark', notificationChannels: { broadcast: { push: true } } }

export { ok, badValue, badKey, managedKey, settable, notSettable, stored }
