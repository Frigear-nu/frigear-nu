import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { SubmissionSummaryDto } from '../../../../types'
import { renderAnswers } from '../../utils/render'

export default defineEventHandler(async (event): Promise<SubmissionSummaryDto[]> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const rows = await db.select().from(schema.formSubmissions)
    .where(eq(schema.formSubmissions.formId, form.id))
    .orderBy(desc(schema.formSubmissions.createdAt))
    .limit(500)
  return rows.map(row => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    locale: row.locale,
    userId: row.userId,
    deliveryStatus: row.deliveryStatus,
    preview: renderAnswers(row.definitionSnapshot, row.answers, row.locale)
      .filter(answer => answer.value)
      .slice(0, 3)
      .map(({ label, value }) => ({ label, value: value.slice(0, 120) })),
  }))
})
