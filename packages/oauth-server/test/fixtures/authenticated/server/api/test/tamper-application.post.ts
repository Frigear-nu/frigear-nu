import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { z } from 'zod'

// Test only: writes an application row directly, as another deploy (or a dev server on the same database) with
// different config would.
const bodySchema = z.object({
  id: z.string(),
  set: z.object({
    name: z.string().optional(),
    redirectUris: z.array(z.string()).optional(),
    allowedRoles: z.array(z.string()).optional(),
    clientType: z.enum(['confidential', 'public']).optional(),
  }),
})

export default defineEventHandler(async (event) => {
  const { id, set } = await readValidatedBody(event, bodySchema.parse)
  const [row] = await db.update(schema.oauthApplications).set(set).where(eq(schema.oauthApplications.id, id)).returning()
  return { id: row?.id ?? null }
})
