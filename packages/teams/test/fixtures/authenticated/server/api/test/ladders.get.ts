import { db, schema } from '@nuxthub/db'

// Test-only: the stored ladder rows, to check the first-request seeding.
export default defineEventHandler(() => db.select().from(schema.teamRoleLadders))
