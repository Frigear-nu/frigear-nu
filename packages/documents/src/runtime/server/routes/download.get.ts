import { blob } from '@nuxthub/blob'

// Downloads only go through here (never a public URL): the document must be visible to the user, folders included.
export default defineEventHandler(async (event) => {
  const viewer = await requireDocumentsViewer(event)
  const id = getRouterParam(event, 'id')!
  const data = await loadDocuments()
  const row = data.rows.find(candidate => candidate.id === id)
  // 404 for hidden documents too, so ids cannot be probed.
  if (!row || row.kind !== 'file' || !row.pathname || !(await visibleIdsFor(viewer, data)).has(row.id)) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
  }

  const stored = await blob.get(row.pathname)
  if (!stored) throw createError({ statusCode: 404, statusMessage: 'Document not found.' })
  const filename = row.filename ?? 'document'
  setResponseHeader(event, 'content-type', row.contentType ?? 'application/octet-stream')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  return stored
})
