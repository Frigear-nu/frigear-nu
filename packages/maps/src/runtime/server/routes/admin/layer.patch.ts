import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { conflict } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import type { AdminMapLayerDto } from '../../../../types'

// Edits a stored layer: name, key, order, whether it shows when the map opens, whether features can be drawn on it,
// and its visibility (which narrows the map's).
export default defineEventHandler(async (event): Promise<AdminMapLayerDto> => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id, layerId } = await getValidatedRouterParams(event, mapsAdminLayerParams.parse)
  const input = await readValidatedBody(event, mapsLayerPatchInput.parse)
  const row = await getMapOr404(id)
  const layer = await getMapLayerOr404(row.id, layerId)
  if (input.key !== undefined && input.key !== layer.key) await mapsAssertLayerKeyFree(row, input.key)

  const values: Partial<typeof schema.mapLayers.$inferInsert> = {}
  for (const key of ['key', 'name', 'sort', 'visible', 'editable', 'visibility'] as const) {
    if (input[key] !== undefined) (values as Record<string, unknown>)[key] = input[key]
  }
  if (!Object.keys(values).length) return toAdminMapLayerDto(layer)
  const [updated] = await db.update(schema.mapLayers).set(values).where(eq(schema.mapLayers.id, layer.id)).returning()
    .catch((error: unknown) => {
      if (isMapsUniqueViolation(error)) throw conflict('The map has a layer with this key already.', { field: 'key' })
      throw error
    })
  return toAdminMapLayerDto(updated!)
})
