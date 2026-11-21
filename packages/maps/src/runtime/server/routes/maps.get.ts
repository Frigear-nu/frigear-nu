import { db, schema } from '@nuxthub/db'
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { mapsAccess } from '../../access'
import type { MapSummaryDto } from '../../../types'

// The maps the caller may see, filtered by owner (`?ownerType=operation&ownerId=opr_...`; `ownerType=platform` alone
// lists the platform's). Public maps for everyone; the rest through `maps:read` and the map's visibility, all of them
// for staff with `maps:manage`. A bounded list (at most 500 maps per owner filter).
export default defineEventHandler(async (event): Promise<MapSummaryDto[]> => {
  const query = await getValidatedQuery(event, mapsListQuery.parse)
  const conditions: (SQL | undefined)[] = []
  if (query.ownerType) conditions.push(eq(schema.maps.ownerType, query.ownerType))
  if (query.ownerId) conditions.push(eq(schema.maps.ownerId, query.ownerId))
  else if (query.ownerType === 'platform') conditions.push(isNull(schema.maps.ownerId))
  const rows = await db.select().from(schema.maps).where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(schema.maps.createdAt)).limit(500)

  const canRead = await allows(event, mapsAccess.permissions.read)
  const canManage = canRead && await allows(event, mapsAccess.permissions.manage)
  const viewer = canRead && !canManage ? await resolveMapsViewer(event) : null
  return rows
    .filter(row => isMapPublic(row) || canManage || (!!viewer && mapsVisibleTo(row.visibility, viewer)))
    .map(toMapSummaryDto)
})
