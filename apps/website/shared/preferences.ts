import { z } from 'zod'
import { definePreferences } from '@frigear-nu/preferences/define'

// The per-user preferences of this app. `UserPreferences` is typed from this file, so `useUserPreferences()` and
// `getUserPreference()` know these keys and value types. Preferences with a `claim` are forwarded to the
// applications users sign in to (ID token and `userinfo`, `profile` scope).
export default definePreferences({
  // Apps that sign users in through this server follow the same theme instead of falling back to light.
  colorMode: { schema: z.enum(['light', 'dark', 'system']), claim: 'color_mode' },
})
