import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'

export default defineEventHandler(async (event) => {
  await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getFaqItemOr404(id)
  await authorize(event, faqAccess.permissions.manage, existing)
  await db.delete(schema.faqItems).where(eq(schema.faqItems.id, id))
  await callFaqGroupUpdated(event, existing.groupId)
  return noContent(event)
})
