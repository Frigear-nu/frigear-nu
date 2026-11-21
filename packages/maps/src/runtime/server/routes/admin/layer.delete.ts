import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { noContent } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'

// Deletes a stored layer and every feature on it.
export default defineEventHandler(async (event) => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id, layerId } = await getValidatedRouterParams(event, mapsAdminLayerParams.parse)
  const row = await getMapOr404(id)
  const layer = await getMapLayerOr404(row.id, layerId)
  await db.delete(schema.mapFeatures).where(eq(schema.mapFeatures.layerId, layer.id))
  await db.delete(schema.mapLayers).where(eq(schema.mapLayers.id, layer.id))
  return noContent(event)
})
