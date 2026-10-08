import { db, schema } from '@nuxthub/db'

export default defineEventHandler(() => db.select().from(schema.eventTickets))
