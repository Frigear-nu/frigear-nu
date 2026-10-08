import { db, schema } from '@nuxthub/db'

// Test-only: raw rows, to assert on what the webhook handler stored.
export default defineEventHandler(async () => db.select().from(schema.subscriptions))
