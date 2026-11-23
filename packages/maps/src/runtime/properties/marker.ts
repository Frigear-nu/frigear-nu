// Properties of the built-in `maps.marker` feature kind (a point with a description).
import { z } from 'zod'
import { translatedProperty } from '../utils/properties'

export default z.object({
  description: translatedProperty({ label: { da: 'Beskrivelse', en: 'Description' } }).optional(),
})
