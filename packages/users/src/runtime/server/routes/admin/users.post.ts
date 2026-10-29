import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { apiError, created } from '@frigear-nu/module-kit/server'
import { emailField, nameField } from '../../schemas'

const bodySchema = z.object({
  name: nameField(),
  email: emailField(),
  role: z.string().trim().min(1).max(60).optional(),
  // Verified accounts are signed in by the emailed link below; leave unverified to let the user verify themselves.
  emailVerified: z.boolean().default(false),
  sendWelcomeEmail: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  // Staff only, before the body is read; then the host decides on the values (e.g. the role handed out).
  await authorizeUsersAdmin(event, 'create')
  const input = await readValidatedBody(event, bodySchema.parse)
  const withRole = usersHaveRoles()
  await authorizeUsersAdmin(event, 'create', { input: { role: withRole ? input.role : undefined, email: input.email, name: input.name } })

  await assertEmailAvailable(input.email)

  const [user] = await db.insert(schema.users).values({
    name: input.name,
    email: input.email,
    emailVerifiedAt: input.emailVerified ? new Date() : null,
    ...(withRole && input.role ? { role: input.role } : {}),
  } as typeof schema.users.$inferInsert).returning()

  if (!user) {
    throw apiError(500, 'internal_error', 'Failed to create the user.')
  }

  // The user has no password: the emailed single-use link (which also verifies the address) signs them in.
  if (input.sendWelcomeEmail) {
    await sendVerificationLink(event, user)
  }

  return created(event, toAdminUserDto(user))
})
