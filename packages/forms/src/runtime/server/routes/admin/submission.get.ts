import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams } from '@frigear-nu/module-kit/server'
import type { SubmissionDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<SubmissionDto> => {
  await authorize(event, 'forms:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await findSubmissionById(id)
  const files = await db.select().from(schema.formSubmissionFiles).where(eq(schema.formSubmissionFiles.submissionId, row.id))
  return toSubmissionDto(row, files)
})
