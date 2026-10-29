import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams } from '@frigear-nu/module-kit/server'
import type { FormPasswordStatusDto } from '../../../../types'

// Whether a password is set; the hash never leaves the server.
export default defineEventHandler(async (event): Promise<FormPasswordStatusDto> => {
  await formsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const form = await findFormById(id)
  const [row] = await db.select({ formId: schema.formAccess.formId }).from(schema.formAccess).where(eq(schema.formAccess.formId, form.id)).limit(1)
  return { set: !!row }
})
