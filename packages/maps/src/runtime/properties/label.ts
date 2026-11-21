// Properties of the built-in `maps.label` feature kind: a text on the map. The text itself is the feature's label.
import { z } from 'zod'

export default z.object({
  size: z.enum(['small', 'medium', 'large']).meta({ label: { da: 'Størrelse', en: 'Size' } }).default('medium'),
})
