import { db, schema } from '@nuxthub/db'

// The rows as stored, to check that the tokens are encrypted at rest.
export default defineEventHandler(() => db.select().from(schema.authOAuthTokens))
