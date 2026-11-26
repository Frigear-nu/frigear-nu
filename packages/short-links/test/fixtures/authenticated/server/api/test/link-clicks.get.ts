import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// The stored click rows of one link (fixture only).
export default defineEventHandler(async (event) => {
  const id = String(getQuery(event).id ?? '')
  return db.select().from(schema.shortLinkClicks).where(eq(schema.shortLinkClicks.linkId, id))
})
