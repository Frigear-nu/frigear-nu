import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams, noContent } from '@frigear-nu/module-kit/server'

// Removes the shared password: a password form is closed until a new one is set.
export default defineEventHandler(async (event) => {
  await authorize(event, 'forms:credentials')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const form = await findFormById(id)
  await db.delete(schema.formAccess).where(eq(schema.formAccess.formId, form.id))
  return noContent(event)
})
