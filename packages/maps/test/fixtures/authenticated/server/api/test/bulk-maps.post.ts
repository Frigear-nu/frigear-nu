import { db, schema } from '@nuxthub/db'
import { z } from 'zod'

// Test-only: inserts many maps of one owner type directly, oldest first, so list paging can be tested.
export default defineEventHandler(async (event) => {
  const { ownerType, hidden, visible } = await readValidatedBody(event, z.object({
    ownerType: z.string(),
    hidden: z.number().int(),
    visible: z.array(z.record(z.string(), z.unknown()).nullable()),
  }).parse)
  const start = Date.now() - 1_000_000
  const rows = [
    ...Array.from({ length: hidden }, () => ({ globalRoles: ['nobody'] })),
    ...visible,
  ].map((visibility, index) => ({
    id: `map_bulk${ownerType}${String(index).padStart(4, '0')}`,
    kind: 'maps.generic-geo',
    base: 'geo',
    ownerType,
    ownerId: null,
    name: `Bulk ${index}`,
    view: { center: [55.6, 12.1] as [number, number], zoom: 12 },
    visibility,
    source: 'admin',
    createdAt: new Date(start + index * 1000),
    updatedAt: new Date(start + index * 1000),
  }))
  for (let index = 0; index < rows.length; index += 50) await db.insert(schema.maps).values(rows.slice(index, index + 50))
  return rows.slice(hidden).map(row => row.id)
})
