import { db, schema } from '@nuxthub/db'
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().toLowerCase(),
  role: z.string().min(1).optional(),
  // Verified accounts are signed in by the emailed link below; leave unverified to let the user verify themselves.
  emailVerified: z.boolean().default(false),
  sendWelcomeEmail: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, bodySchema.parse)
  const withRole = usersHaveRoles()
  await authorizeUsersAdmin(event, 'create', { input: { role: withRole ? input.role : undefined, email: input.email, name: input.name } })

  const existing = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, input.email) })
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists.' })
  }

  const [created] = await db.insert(schema.users).values({
    name: input.name,
    email: input.email,
    emailVerifiedAt: input.emailVerified ? new Date() : null,
    ...(withRole && input.role ? { role: input.role } : {}),
  } as typeof schema.users.$inferInsert).returning()

  if (!created) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create the user.' })
  }

  // The user has no password: the emailed single-use link (which also verifies the address) signs them in.
  if (input.sendWelcomeEmail && schema.magicLinks) {
    const link = await createMagicLink(event, { userId: created.id, redirectUrl: '/' })
    if (link) {
      await dispatchAuthEmail('verify-email', created.email, { name: created.name, url: link.url })
    }
  }

  const { password: _password, ...safe } = created
  return safe
})
