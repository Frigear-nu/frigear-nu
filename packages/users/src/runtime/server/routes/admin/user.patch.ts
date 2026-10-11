import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().toLowerCase().optional(),
  role: z.string().min(1).optional(),
})

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })
  }
  const input = await readValidatedBody(event, bodySchema.parse)
  const withRole = usersHaveRoles()

  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await authorizeUsersAdmin(event, 'update', {
    input: { role: withRole ? input.role : undefined, email: input.email, name: input.name },
    target: { id: target.id, email: target.email, role: withRole ? (target as { role?: string }).role : undefined },
  })

  if (input.email && input.email !== target.email) {
    const taken = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, input.email!) })
    if (taken) {
      throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists.' })
    }
  }

  const [updated] = await db.update(schema.users)
    .set({
      ...(input.name ? { name: input.name } : {}),
      // A changed address was typed in by staff, so it is unverified until its owner confirms it.
      ...(input.email && input.email !== target.email ? { email: input.email, emailVerifiedAt: null } : {}),
      ...(withRole && input.role ? { role: input.role } : {}),
    } as Partial<typeof schema.users.$inferInsert>)
    .where(eq(schema.users.id, id))
    .returning()

  const { password: _password, ...safe } = updated!
  return safe
})
