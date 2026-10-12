import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormPasswordStatusDto } from '../../../../types'

// Whether a password is set; the hash never leaves the server.
export default defineEventHandler(async (event): Promise<FormPasswordStatusDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const [row] = await db.select({ formId: schema.formAccess.formId }).from(schema.formAccess).where(eq(schema.formAccess.formId, form.id)).limit(1)
  return { set: !!row }
})
