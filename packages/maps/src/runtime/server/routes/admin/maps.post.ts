import { conflict, created } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../../access'
import type { AdminMapDto, OwnerRef } from '../../../../types'

// Creates a map of a registered kind for an owner: the platform (`ownerId: null`) or any owner `audience:owner:resolve`
// knows (400 when not, or when the kind wants another owner type). It starts with the kind's default view and layers.
export default defineEventHandler(async (event): Promise<AdminMapDto> => {
  await authorize(event, mapsAccess.permissions.manage)
  const input = await readValidatedBody(event, mapsCreateInput.parse)
  const kind = mapsKindOr400(input.kind)
  const owner: OwnerRef = { type: input.ownerType, id: input.ownerId ?? null }
  const ownerLabel = await mapsAssertOwner(event, owner, kind)
  const view = mapsViewOr400(kind.base, input.view, kind.defaultView)
  await mapsAssertKeyFree(input.key)

  const row = await insertMapRow({ kind, owner, name: input.name, key: input.key ?? null, view, visibility: input.visibility ?? null, source: 'admin' })
    .catch((error: unknown) => {
      if (isMapsUniqueViolation(error)) throw conflict('A map with this key already exists.', { field: 'key' })
      throw error
    })
  return created(event, toAdminMapDto(row, ownerLabel))
})
