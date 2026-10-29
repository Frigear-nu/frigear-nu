import { count, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams } from '@frigear-nu/module-kit/server'
import type { FormAdminDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<FormAdminDto> => {
  await formsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await findFormById(id)
  const [totals] = await db.select({ total: count() }).from(schema.formSubmissions).where(eq(schema.formSubmissions.formId, row.id))
  return { ...toAdminForm(row), submissionCount: totals?.total ?? 0 }
})
