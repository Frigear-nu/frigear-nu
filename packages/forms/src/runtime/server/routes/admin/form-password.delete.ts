import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormPasswordStatusDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<FormPasswordStatusDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  await db.delete(schema.formAccess).where(eq(schema.formAccess.formId, form.id))
  return { set: false }
})
