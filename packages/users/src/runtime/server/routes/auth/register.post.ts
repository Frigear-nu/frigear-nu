import { db, schema } from '@nuxthub/db'

import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})

export default defineEventHandler(async (event) => {
  const { name, email, password } = await readValidatedBody(event, bodySchema.parse)

  const existing = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })

  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists.' })
  }

  const hashed = await hashPassword(password)
  const [user] = await db.insert(schema.users).values({ name, email, password: hashed }).returning()

  await setUserSession(event, { user: mapUserToSession(user) })

  return { id: user.id }
})
