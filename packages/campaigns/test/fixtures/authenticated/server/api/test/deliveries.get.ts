import { db, schema } from '@nuxthub/db'

// Test-only: every campaign delivery and counted click, as stored.
export default defineEventHandler(async () => ({
  deliveries: await db.select().from(schema.campaignDeliveries),
  clicks: await db.select().from(schema.campaignClicks),
}))
