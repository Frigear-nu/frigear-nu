import { db, schema } from '@nuxthub/db'
import { conflict, created, idParams } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import { newId } from '../../../utils'
import type { AdminMapLayerDto } from '../../../../types'

// Adds a stored layer to a map. Its key is unique on the map and may not be the key of a provider layer that applies
// to the map (409).
export default defineEventHandler(async (event): Promise<AdminMapLayerDto> => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, mapsLayerInput.parse)
  const row = await getMapOr404(id)
  await mapsAssertLayerKeyFree(row, input.key)

  const [layer] = await db.insert(schema.mapLayers).values({
    id: newId('mpl'),
    mapId: row.id,
    key: input.key,
    name: input.name,
    sort: input.sort ?? 0,
    visible: input.visible ?? true,
    editable: input.editable ?? true,
    visibility: input.visibility ?? null,
  }).returning().catch((error: unknown) => {
    if (isMapsUniqueViolation(error)) throw conflict('The map has a layer with this key already.', { field: 'key' })
    throw error
  })
  return created(event, toAdminMapLayerDto(layer!))
})
