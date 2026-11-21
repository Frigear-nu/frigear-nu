// Properties of the `operations.container` feature kind: a storage or cold container on a venue layout. Bundled into the
// app (the editor's form) and the server (`validatePlaneLayout`): zod only.
import { z } from 'zod'
import { translatedProperty } from '@frigear-nu/maps/properties'

export default z.object({
  number: z.string().trim().max(20).meta({ label: { da: 'Nummer', en: 'Number' } }).optional(),
  contents: translatedProperty({ label: { da: 'Indhold', en: 'Contents' } }).optional(),
  cooled: z.boolean().default(false).meta({ label: { da: 'Køl', en: 'Cooled' } }),
})
