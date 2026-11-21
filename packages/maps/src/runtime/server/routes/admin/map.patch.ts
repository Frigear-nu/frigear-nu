import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { conflict, idParams } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import type { AdminMapDto, MapBase, OwnerRef } from '../../../../types'

// Edits a map's name, key, view, visibility or owner. The kind, and so the base, never changes; a new owner is checked
// like on create.
export default defineEventHandler(async (event): Promise<AdminMapDto> => {
  await authorize(event, mapsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, mapsPatchInput.parse)
  const row = await getMapOr404(id)

  const values: Partial<typeof schema.maps.$inferInsert> = {}
  if (input.name !== undefined) values.name = input.name
  if (input.key !== undefined && input.key !== row.key) {
    await mapsAssertKeyFree(input.key, row.id)
    values.key = input.key
  }
  if (input.view !== undefined) values.view = mapsViewOr400(row.base as MapBase, input.view, row.view)
  if (input.visibility !== undefined) values.visibility = input.visibility
  let ownerLabel: Awaited<ReturnType<typeof mapsAssertOwner>> | undefined
  if (input.ownerType !== undefined || input.ownerId !== undefined) {
    const owner: OwnerRef = {
      type: input.ownerType ?? row.ownerType,
      id: input.ownerId !== undefined ? input.ownerId : (row.ownerId ?? null),
    }
    ownerLabel = await mapsAssertOwner(event, owner, mapsKind(row.kind))
    values.ownerType = owner.type
    values.ownerId = owner.type === 'platform' ? null : owner.id
  }
  if (!Object.keys(values).length) return toAdminMapDto(row, await mapsOwnerLabel(event, row))

  const [updated] = await db.update(schema.maps).set(values).where(eq(schema.maps.id, row.id)).returning()
    .catch((error: unknown) => {
      if (isMapsUniqueViolation(error)) throw conflict('A map with this key already exists.', { field: 'key' })
      throw error
    })
  return toAdminMapDto(updated!, ownerLabel !== undefined ? ownerLabel : await mapsOwnerLabel(event, updated!))
})
