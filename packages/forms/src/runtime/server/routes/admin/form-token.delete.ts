import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import type { FormAccessTokenDto } from '../../../../types'

// Revokes (keeps the row so the list still shows when it was last used).
export default defineEventHandler(async (event): Promise<FormAccessTokenDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const [row] = await db.update(schema.formAccessTokens).set({ revokedAt: new Date() }).where(and(
    eq(schema.formAccessTokens.id, getRouterParam(event, 'tokenId')!),
    eq(schema.formAccessTokens.formId, form.id),
  )).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Token not found.' })
  return toTokenDto(row)
})
