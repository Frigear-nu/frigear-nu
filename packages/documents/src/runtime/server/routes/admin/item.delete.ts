import { inArray } from 'drizzle-orm'
import { blob } from '@nuxthub/blob'
import { db, schema } from '@nuxthub/db'
import { subtreeIds } from '../../../utils'

// Deleting a folder deletes everything in it, files included.
export default defineEventHandler(async (event) => {
  await requireDocumentsManager(event)
  const target = await findDocument(getRouterParam(event, 'id')!)
  const { rows } = await loadDocuments()
  const ids = subtreeIds(rows, target.id)
  const pathnames = rows.filter(row => ids.includes(row.id) && row.pathname).map(row => row.pathname!)

  await db.delete(schema.documentShares).where(inArray(schema.documentShares.documentId, ids))
  await db.delete(schema.documents).where(inArray(schema.documents.id, ids))
  if (pathnames.length) await blob.del(pathnames)
  setResponseStatus(event, 204)
  return null
})
