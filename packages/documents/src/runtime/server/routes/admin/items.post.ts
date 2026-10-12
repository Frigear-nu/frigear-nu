import { db, schema } from '@nuxthub/db'
import { newId } from '../../../utils'
import { folderInput } from '../../utils/admin-schemas'

// Creates a folder (files are created through `items/upload`).
export default defineEventHandler(async (event) => {
  await requireDocumentsManager(event)
  const input = await readValidatedBody(event, folderInput.parse)
  const parentId = await assertFolder(input.parentId)

  const [row] = await db.insert(schema.documents).values({
    id: newId('doc'),
    parentId,
    kind: 'folder',
    title: input.title,
    description: input.description ?? null,
    icon: input.icon ?? null,
    sortOrder: input.sortOrder ?? 0,
    audience: input.audience ?? 'groups',
  }).returning()
  await setShares(row!.id, input.groupIds ?? [])
  setResponseStatus(event, 201)
  const { rows, shares } = await loadDocuments()
  return toAdminDto(rows.find(candidate => candidate.id === row!.id) ?? row!, shares)
})
