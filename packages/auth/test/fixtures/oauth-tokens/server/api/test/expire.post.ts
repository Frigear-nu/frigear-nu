import { db, schema } from '@nuxthub/db'

export default defineEventHandler(() => db.update(schema.authOAuthTokens).set({ expiresAt: new Date(Date.now() - 1000) }))
