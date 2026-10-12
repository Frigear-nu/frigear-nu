import type { DocumentListing } from '../../../types'

// What the signed-in user may browse: `?parent=<folder id>` lists a folder, no parent lists the root.
export default defineEventHandler(async (event): Promise<DocumentListing> => {
  const viewer = await requireDocumentsViewer(event)
  const data = await loadDocuments()
  const visible = await visibleIdsFor(viewer, data)
  return listFolder(data.rows, queryParent(event), visible, toDto)
})
