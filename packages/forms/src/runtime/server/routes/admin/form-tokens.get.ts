import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormAccessTokenDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<FormAccessTokenDto[]> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const rows = await db.select().from(schema.formAccessTokens).where(eq(schema.formAccessTokens.formId, form.id)).orderBy(desc(schema.formAccessTokens.createdAt))
  return rows.map(toTokenDto)
})
