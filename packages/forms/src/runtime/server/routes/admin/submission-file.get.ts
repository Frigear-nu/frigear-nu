import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { blob } from '@nuxthub/blob'
import { idParams, notFound } from '@frigear-nu/module-kit/server'

const params = idParams().extend(idParams('fileId').shape)

// Staff-only file download (the old app let any signed-in user fetch any blob path).
export default defineEventHandler(async (event) => {
  await authorize(event, 'forms:manage')
  const { id, fileId } = await getValidatedRouterParams(event, params.parse)
  const [file] = await db.select().from(schema.formSubmissionFiles).where(and(
    eq(schema.formSubmissionFiles.submissionId, id),
    eq(schema.formSubmissionFiles.id, fileId),
  )).limit(1)
  if (!file) throw notFound('File not found.')

  const stored = await blob.get(file.pathname)
  if (!stored) throw notFound('File not found.')
  setResponseHeader(event, 'content-type', file.contentType)
  setResponseHeader(event, 'content-disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`)
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  return stored
})
