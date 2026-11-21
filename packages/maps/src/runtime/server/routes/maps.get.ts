import { db, schema } from '@nuxthub/db'
import { and, asc, eq, is, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import type { MapRow } from '../utils/maps'
import { mapsAccess } from '../../access'
import type { MapSummaryDto } from '../../../types'

/** The most maps one list answers with. */
const LIST_LIMIT = 500
/** Rows read per round while filtering by visibility. */
const BATCH = 200

// The maps the caller may see, filtered by owner (`?ownerType=operation&ownerId=opr_...`; `ownerType=platform` alone
// lists the platform's). Public maps for everyone; the rest through `maps:read` and the map's visibility, all of them
// for staff with `maps:manage`. A bounded list: at most 500 maps the caller may see, oldest first.
export default defineEventHandler(async (event): Promise<MapSummaryDto[]> => {
  const query = await getValidatedQuery(event, mapsListQuery.parse)
  const conditions: (SQL | undefined)[] = []
  if (query.ownerType) conditions.push(eq(schema.maps.ownerType, query.ownerType))
  if (query.ownerId) conditions.push(eq(schema.maps.ownerId, query.ownerId))
  else if (query.ownerType === 'platform') conditions.push(isNull(schema.maps.ownerId))

  const canRead = await allows(event, mapsAccess.permissions.read)
  const canManage = canRead && await allows(event, mapsAccess.permissions.manage)
  // Anonymous callers (and tokens without `maps:read`) see public maps only: narrow in SQL first, so the limit counts
  // only candidates. sqlite reads JSON `true` as 1, postgresql's `->>` as the text 'true'. The parsed visibility is
  // still checked below.
  if (!canRead) {
    conditions.push(is(schema.maps, PgTable)
      ? sql`(${schema.maps.visibility}->>'public') = 'true'`
      : sql`json_extract(${schema.maps.visibility}, '$.public') = 1`)
  }
  const where = conditions.length ? and(...conditions) : undefined
  const viewer = canRead && !canManage ? await resolveMapsViewer(event) : null
  const visible = (row: MapRow) => isMapPublic(row) || canManage || (!!viewer && mapsVisibleTo(row.visibility, viewer))

  // Visibility is decided per row, so read in batches until the list is full or the rows run out.
  const result: MapSummaryDto[] = []
  for (let offset = 0; result.length < LIST_LIMIT; offset += BATCH) {
    const rows = await db.select().from(schema.maps).where(where)
      .orderBy(asc(schema.maps.createdAt), asc(schema.maps.id)).limit(BATCH).offset(offset)
    for (const row of rows) {
      if (visible(row) && result.length < LIST_LIMIT) result.push(toMapSummaryDto(row))
    }
    if (rows.length < BATCH) break
  }
  return result
})
