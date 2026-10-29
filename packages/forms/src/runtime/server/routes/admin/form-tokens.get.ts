import { desc, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams } from '@frigear-nu/module-kit/server'
import type { FormAccessTokenDto } from '../../../../types'

// A small bounded list (a form has a handful of tokens), so a plain array.
export default defineEventHandler(async (event): Promise<FormAccessTokenDto[]> => {
  await formsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const form = await findFormById(id)
  const rows = await db.select().from(schema.formAccessTokens).where(eq(schema.formAccessTokens.formId, form.id)).orderBy(desc(schema.formAccessTokens.createdAt))
  return rows.map(toFormTokenDto)
})
