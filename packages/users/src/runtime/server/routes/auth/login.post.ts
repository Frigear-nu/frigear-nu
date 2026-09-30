import { db } from '@nuxthub/db'

import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)

  const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })

  if (!user?.password || !(await verifyPassword(user.password, password))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  await setUserSession(event, { user: mapUserToSession(user) })

  return { id: user.id }
})
