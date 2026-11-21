import { db, schema } from '@nuxthub/db'
import { count, eq } from 'drizzle-orm'
import { idParams } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import type { AdminMapDetailDto } from '../../../../types'

// One map for staff: every field, and every layer (hidden ones included) with its number of features.
export default defineEventHandler(async (event): Promise<AdminMapDetailDto> => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getMapOr404(id)
  const [layers, counts] = await Promise.all([
    listMapLayers(row.id),
    db.select({ layerId: schema.mapFeatures.layerId, total: count() }).from(schema.mapFeatures)
      .where(eq(schema.mapFeatures.mapId, row.id)).groupBy(schema.mapFeatures.layerId),
  ])
  const totals = new Map(counts.map(entry => [entry.layerId, Number(entry.total)]))
  return {
    ...toAdminMapDto(row, await mapsOwnerLabel(event, row)),
    layers: layers.map(layer => ({ ...toAdminMapLayerDto(layer), featureCount: totals.get(layer.id) ?? 0 })),
  }
})
