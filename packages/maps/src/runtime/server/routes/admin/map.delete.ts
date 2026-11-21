import { db, schema } from '@nuxthub/db'
import { blob } from '@nuxthub/blob'
import { eq } from 'drizzle-orm'
import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'

// Deletes a map with its layers, features and floor plan. Features of other maps that link to it keep a dangling
// `linkMapId`, which clients treat as no link. A map created from code comes back on the next `ensureMap` call.
export default defineEventHandler(async (event) => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getMapOr404(id)
  // Children first: sqlite enforces the foreign keys' cascade only when the connection turns them on.
  await db.delete(schema.mapFeatures).where(eq(schema.mapFeatures.mapId, row.id))
  await db.delete(schema.mapLayers).where(eq(schema.mapLayers.mapId, row.id))
  await db.delete(schema.maps).where(eq(schema.maps.id, row.id))
  if (row.underlay?.pathname) {
    await blob.delete(row.underlay.pathname).catch((error: unknown) => console.error('[maps] the floor plan could not be deleted', error))
  }
  return noContent(event)
})
