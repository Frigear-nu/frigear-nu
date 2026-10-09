import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { blob } from '@nuxthub/blob'

// Staff-only file download (the old app let any signed-in user fetch any blob path).
export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const [file] = await db.select().from(schema.formSubmissionFiles).where(and(
    eq(schema.formSubmissionFiles.submissionId, getRouterParam(event, 'id')!),
    eq(schema.formSubmissionFiles.id, getRouterParam(event, 'fileId')!),
  )).limit(1)
  if (!file) throw createError({ statusCode: 404, statusMessage: 'File not found.' })

  const stored = await blob.get(file.pathname)
  if (!stored) throw createError({ statusCode: 404, statusMessage: 'File not found.' })
  setResponseHeader(event, 'content-type', file.contentType)
  setResponseHeader(event, 'content-disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`)
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  return stored
})
