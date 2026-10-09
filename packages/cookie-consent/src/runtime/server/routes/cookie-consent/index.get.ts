import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const [row] = await db.select({
    acceptedAt: schema.users.cookieConsentAcceptedAt,
    version: schema.users.cookieConsentVersion,
    categories: schema.users.cookieConsentCategories,
  }).from(schema.users).where(eq(schema.users.id, user.id))

  if (!row?.acceptedAt || !row.version || !row.categories) return { consent: null }

  return { consent: { v: row.version, ts: row.acceptedAt, categories: JSON.parse(row.categories) as Record<string, boolean> } }
})
