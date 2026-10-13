import type { UserPreferences } from '@frigear-nu/preferences'

// Compile-time checks run by `pnpm test:types`: the keys and value types come from `shared/preferences.ts`.
const ok: UserPreferences = { colorMode: 'dark', compactTables: true, pageSize: 50 }

// @ts-expect-error - not one of the schema's values
const badValue: UserPreferences = { colorMode: 'neon' }
// @ts-expect-error - not a registered preference
const badKey: UserPreferences = { unknown: true }

export { ok, badValue, badKey }
