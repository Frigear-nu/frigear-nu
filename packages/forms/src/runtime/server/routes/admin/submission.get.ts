import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { SubmissionDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<SubmissionDto> => {
  await requireFormsManager(event)
  const [row] = await db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.id, getRouterParam(event, 'id')!)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Submission not found.' })
  const files = await db.select().from(schema.formSubmissionFiles).where(eq(schema.formSubmissionFiles.submissionId, row.id))
  return {
    id: row.id,
    formId: row.formId,
    formSlug: row.formSlug,
    formVersion: row.formVersion,
    definition: row.definitionSnapshot,
    answers: row.answers,
    files: files.map(({ id, fieldKey, filename, contentType, size }) => ({ id, fieldKey, filename, contentType, size })),
    locale: row.locale,
    userId: row.userId,
    deliveryStatus: row.deliveryStatus,
    deliveryError: row.deliveryError,
    createdAt: row.createdAt.toISOString(),
  }
})
