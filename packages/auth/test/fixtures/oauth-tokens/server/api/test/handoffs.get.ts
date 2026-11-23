import { db, schema } from '@nuxthub/db'

// The handoff attempts as stored, to check what is kept and that a collected attempt is gone.
export default defineEventHandler(() => db.select().from(schema.authFrigearHandoffs))
