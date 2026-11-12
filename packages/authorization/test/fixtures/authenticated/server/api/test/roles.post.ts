import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { provider } from '#auth/roles'

// Test only: stores roles for a user through the role provider (`source` defaults to `manual`), as an admin seed or
// single sign-on would.
export default defineEventHandler(async (event) => {
  const { email, roles, source = 'manual' } = await readBody<{ email: string, roles: string[], source?: 'manual' | 'sso' | 'migrated' }>(event)
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email))
  if (!user) throw createError({ statusCode: 404 })
  await provider.setRoles(user.id, roles, { source })
  return { id: user.id }
})
