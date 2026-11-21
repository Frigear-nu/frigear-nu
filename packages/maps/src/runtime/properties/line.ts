// Properties of the built-in `maps.line` feature kind (a route or a line).
import { z } from 'zod'
import { translatedProperty } from '../utils/properties'

export default z.object({
  description: translatedProperty({ label: { da: 'Beskrivelse', en: 'Description' } }).optional(),
})
