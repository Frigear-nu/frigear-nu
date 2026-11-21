import { db, schema } from '@nuxthub/db'

// Test-only: every device row as stored, tokens included.
export default defineEventHandler(() => db.select().from(schema.pushDevices))
