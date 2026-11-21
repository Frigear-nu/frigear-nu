import { db, schema } from '@nuxthub/db'
import { created, notFound } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../access'
import { newId } from '../../utils'
import type { MapFeatureDto } from '../../../types'

// Draws a feature on a map (`maps:edit` with the map: staff, the kind's `editPermission`, or an owner module's
// `maps:edit:resolve`). The layer must be editable (409 `layer_not_editable`); the feature kind must belong to the map's
// kind, and its geometry and properties must pass the feature kind (400). Fires `maps:feature:created`.
export default defineEventHandler(async (event): Promise<MapFeatureDto> => {
  await authorize(event, mapsAccess.permissions.edit)
  const { map } = await getValidatedRouterParams(event, mapsMapParams.parse)
  const input = await readValidatedBody(event, mapsFeatureInput.parse)
  const row = await findMapByIdOrKey(map)
  if (!row) throw notFound('Map not found.')
  await authorize(event, mapsAccess.permissions.edit, row)

  const layer = await mapsEditableLayerOr409(row.id, input.layerId)
  const valid = await mapsValidateFeature(row, input)
  await mapsAssertLinkMap(input.linkMapId)

  const [feature] = await db.insert(schema.mapFeatures).values({
    id: newId('mpf'),
    mapId: row.id,
    layerId: layer.id,
    ...valid,
    label: input.label ?? null,
    linkMapId: input.linkMapId ?? null,
    sort: input.sort ?? 0,
  }).returning()

  await useNitroApp().hooks.callHook('maps:feature:created', { event, ...mapsFeatureHookContext(row, feature!) })
  return created(event, toMapFeatureDto(feature!))
})
