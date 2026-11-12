import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

const params = idParams().extend(idParams('tokenId').shape)

// Revokes (keeps the row so the list still shows when it was last used).
export default defineEventHandler(async (event) => {
  await authorize(event, 'forms:credentials')
  const { id, tokenId } = await getValidatedRouterParams(event, params.parse)
  const form = await findFormById(id)
  const [row] = await db.update(schema.formAccessTokens).set({ revokedAt: new Date() }).where(and(
    eq(schema.formAccessTokens.id, tokenId),
    eq(schema.formAccessTokens.formId, form.id),
  )).returning({ id: schema.formAccessTokens.id })
  if (!row) throw notFound('Token not found.')
  return noContent(event)
})
