import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// A deleted group no longer shares anything.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('groups:deleted', async ({ groupId }) => {
    await db.delete(schema.documentShares).where(eq(schema.documentShares.groupId, groupId))
  })
})
