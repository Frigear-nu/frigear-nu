import { z } from 'zod'
import { definePreferences } from '../../../../src/runtime/define'

export default definePreferences({
  colorMode: { schema: z.enum(['light', 'dark', 'system']), claim: 'color_mode' },
  // Stays private to this app: no `claim`.
  compactTables: z.boolean(),
})
