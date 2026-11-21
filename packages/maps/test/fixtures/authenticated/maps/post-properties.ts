// The properties of a first aid post: plain zod plus maps' translated helper, bundled into the app and the server.
import { z } from 'zod'
import { translatedProperty } from '../../../../src/runtime/utils/properties'

export default z.object({
  capacity: z.number().int().min(0).max(50).meta({ label: { da: 'Kapacitet', en: 'Capacity' } }),
  staffed: z.boolean().optional(),
  level: z.enum(['basic', 'advanced']).default('basic'),
  note: translatedProperty({ label: 'Note' }).optional(),
})
