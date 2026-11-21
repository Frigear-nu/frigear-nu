// Properties of the playground's `demo.seat` kind: layout only, a row and a number (no booking).
import { z } from 'zod'

export default z.object({
  row: z.string().max(8).meta({ label: { da: 'Række', en: 'Row' } }),
  number: z.number().int().min(1).meta({ label: { da: 'Nummer', en: 'Number' } }),
  accessible: z.boolean().default(false).meta({ label: { da: 'Handicapvenlig', en: 'Accessible' } }),
})
