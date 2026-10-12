import { count, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const row = await findFormById(getRouterParam(event, 'id')!)
  const [totals] = await db.select({ total: count() }).from(schema.formSubmissions).where(eq(schema.formSubmissions.formId, row.id))
  return { ...toAdminForm(row), submissionCount: totals?.total ?? 0 }
})
