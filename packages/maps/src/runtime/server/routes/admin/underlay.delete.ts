import { db, schema } from '@nuxthub/db'
import { blob } from '@nuxthub/blob'
import { eq } from 'drizzle-orm'
import { idParams } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import type { AdminMapDto } from '../../../../types'

// Removes the floor plan of a map and deletes the image. The map's view stays as it is.
export default defineEventHandler(async (event): Promise<AdminMapDto> => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getMapOr404(id)
  if (!row.underlay) return toAdminMapDto(row, await mapsOwnerLabel(event, row))
  const [updated] = await db.update(schema.maps).set({ underlay: null }).where(eq(schema.maps.id, row.id)).returning()
  await blob.delete(row.underlay.pathname).catch((error: unknown) => console.error('[maps] the floor plan could not be deleted', error))
  return toAdminMapDto(updated!, await mapsOwnerLabel(event, updated!))
})
