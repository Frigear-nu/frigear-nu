import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { apiError, notFound } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../access'
import type { MapFeatureDto } from '../../../types'

// Changes a feature (`maps:edit` with the map). The feature's layer, and a layer it moves to, must be editable (409);
// the result is checked against the feature kind as a whole (400). Fires `maps:feature:updated` with `previous`.
export default defineEventHandler(async (event): Promise<MapFeatureDto> => {
  await authorize(event, mapsAccess.permissions.edit)
  const { map, featureId } = await getValidatedRouterParams(event, mapsFeatureParams.parse)
  const input = await readValidatedBody(event, mapsFeaturePatchInput.parse)
  const row = await findMapByIdOrKey(map)
  if (!row) throw notFound('Map not found.')
  await authorize(event, mapsAccess.permissions.edit, row)
  const existing = await getMapFeatureOr404(row.id, featureId)

  const current = await getMapLayerOr404(row.id, existing.layerId)
  if (!current.editable) throw apiError(409, 'layer_not_editable', 'Features on this layer cannot be changed.')
  const layer = input.layerId && input.layerId !== existing.layerId ? await mapsEditableLayerOr409(row.id, input.layerId) : current

  const valid = await mapsValidateFeature(row, {
    featureKind: input.featureKind ?? existing.featureKind,
    geometry: input.geometry === undefined ? existing.geometry : input.geometry,
    properties: input.properties ?? existing.properties ?? {},
  })
  if (input.linkMapId !== undefined) await mapsAssertLinkMap(input.linkMapId)

  const [feature] = await db.update(schema.mapFeatures).set({
    layerId: layer.id,
    ...valid,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.linkMapId !== undefined ? { linkMapId: input.linkMapId } : {}),
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
  }).where(eq(schema.mapFeatures.id, existing.id)).returning()

  const context = mapsFeatureHookContext(row, feature!)
  await useNitroApp().hooks.callHook('maps:feature:updated', { event, ...context, previous: toMapFeatureDto(existing) })
  return context.feature
})
