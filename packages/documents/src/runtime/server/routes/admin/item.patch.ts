import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { subtreeIds } from '../../../utils'
import { itemPatch } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireDocumentsManager(event)
  const current = await findDocument(getRouterParam(event, 'id')!)
  const input = await readValidatedBody(event, itemPatch.parse)

  let parentId = current.parentId
  if (input.parentId !== undefined) {
    parentId = await assertFolder(input.parentId)
    // A folder cannot move into itself or below itself.
    if (parentId && subtreeIds((await loadDocuments()).rows, current.id).includes(parentId)) {
      throw createError({ statusCode: 400, statusMessage: 'A folder cannot be moved into itself.' })
    }
  }

  await db.update(schema.documents).set({
    parentId,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.icon !== undefined && { icon: input.icon }),
    ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    ...(input.audience !== undefined && { audience: input.audience }),
  }).where(eq(schema.documents.id, current.id))
  if (input.groupIds !== undefined) await setShares(current.id, input.groupIds)

  const { rows, shares } = await loadDocuments()
  return toAdminDto(rows.find(candidate => candidate.id === current.id)!, shares)
})
