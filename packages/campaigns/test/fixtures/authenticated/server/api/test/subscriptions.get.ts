import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Test-only: every subscription with its contact, as stored (consent proof included).
export default defineEventHandler(async () => {
  return db.select({ subscription: schema.campaignSubscriptions, contact: schema.campaignContacts })
    .from(schema.campaignSubscriptions)
    .innerJoin(schema.campaignContacts, eq(schema.campaignSubscriptions.contactId, schema.campaignContacts.id))
})
