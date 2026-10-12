import type { AdminDocumentDto, DocumentListing } from '../../../../types'

export default defineEventHandler(async (event): Promise<DocumentListing<AdminDocumentDto>> => {
  await requireDocumentsManager(event)
  const { rows, shares } = await loadDocuments()
  const visible = new Set(rows.map(row => row.id))
  return listFolder(rows, queryParent(event), visible, row => toAdminDto(row, shares))
})
