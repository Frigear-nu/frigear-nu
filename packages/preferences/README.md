# @frigear-nu/preferences

Typed per-user preferences that modules and the host app register with `definePreferences`, stored in one JSON column
on `users`, and optionally forwarded to OAuth applications as claims.

```ts
// shared/preferences.ts
import { z } from 'zod'
import { definePreferences } from '@frigear-nu/preferences/define'

export default definePreferences({
  compactTables: z.boolean(),
  colorMode: { schema: z.enum(['light', 'dark', 'system']), claim: 'color_mode' },
})
```

`useUserPreferences()` on the client and `getUserPreference(user, key)` on the server are typed from those schemas.
See the [documentation](https://docs.frigear.dev/modules/preferences).
