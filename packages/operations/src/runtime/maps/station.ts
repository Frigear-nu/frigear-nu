// Properties of the `operations.station` feature kind: a bar, a counter or any other place crew works at on a venue
// layout. Bundled into the app (the editor's form) and the server (`validatePlaneLayout`): zod only.
import { z } from 'zod'
import { translatedProperty } from '@frigear-nu/maps/properties'

export default z.object({
  description: translatedProperty({ label: { da: 'Beskrivelse', en: 'Description' } }).optional(),
  taps: z.number().int().min(0).max(200).meta({ label: { da: 'Haner', en: 'Taps' } }).optional(),
})
