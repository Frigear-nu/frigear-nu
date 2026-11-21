// Properties of the built-in `maps.area` feature kind (a polygon, such as a stage, a bar or a crew area).
import { z } from 'zod'
import { translatedProperty } from '../utils/properties'

export default z.object({
  description: translatedProperty({ label: { da: 'Beskrivelse', en: 'Description' } }).optional(),
  color: z.enum(['primary', 'neutral', 'success', 'warning', 'error', 'info']).meta({ label: { da: 'Farve', en: 'Colour' } }).optional(),
})
