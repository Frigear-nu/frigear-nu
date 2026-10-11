import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await authorizeUsersAdmin(event, 'view')

  const withRole = usersHaveRoles()
  const rows = await db.select().from(schema.users).orderBy(desc(schema.users.createdAt)).limit(1000)

  // Never expose the password hash.
  return rows.map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    ...(withRole ? { role: (user as { role?: string }).role } : {}),
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }))
})
