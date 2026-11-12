import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// Test only: runs the `users.role` migration again; `reset` first removes its marker (as on a fresh database).
export default defineEventHandler(async (event) => {
  const { reset } = await readBody<{ reset?: boolean }>(event)
  if (reset) await db.delete(schema.authorizationMeta).where(eq(schema.authorizationMeta.key, AUTHORIZATION_ROLE_MIGRATION_KEY))
  return runAuthorizationRoleMigration()
})
