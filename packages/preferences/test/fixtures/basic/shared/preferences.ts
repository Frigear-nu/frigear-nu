import { z } from 'zod'
import { definePreferences } from '../../../../src/runtime/define'

// Both shapes: a bare schema, and a schema that is also forwarded to OAuth applications as a claim.
export default definePreferences({
  compactTables: z.boolean(),
  colorMode: { schema: z.enum(['light', 'dark', 'system']), claim: 'color_mode' },
  pageSize: z.number().int().min(10).max(100).default(25),
})
