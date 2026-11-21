import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { apiError, noContent, notFound } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../access'

// Removes a feature (`maps:edit` with the map); its layer must be editable (409). Fires `maps:feature:deleted`.
export default defineEventHandler(async (event) => {
  await authorize(event, mapsAccess.permissions.edit)
  const { map, featureId } = await getValidatedRouterParams(event, mapsFeatureParams.parse)
  const row = await findMapByIdOrKey(map)
  // A map the caller may not see is the same 404 as an unknown one, whatever they could edit.
  if (!row || !(await allows(event, mapsAccess.permissions.read, row))) throw notFound('Map not found.')
  await authorize(event, mapsAccess.permissions.edit, row)
  const existing = await getMapFeatureOr404(row.id, featureId)
  const layer = await getMapLayerOr404(row.id, existing.layerId)
  if (!layer.editable) throw apiError(409, 'layer_not_editable', 'Features on this layer cannot be removed.')

  await db.delete(schema.mapFeatures).where(eq(schema.mapFeatures.id, existing.id))
  await useNitroApp().hooks.callHook('maps:feature:deleted', { event, ...mapsFeatureHookContext(row, existing) })
  return noContent(event)
})
