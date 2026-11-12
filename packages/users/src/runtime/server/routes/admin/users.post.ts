import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { apiError, created } from '@frigear-nu/module-kit/server'
import { emailField, nameField } from '../../schemas'

const bodySchema = z.object({
  name: nameField(),
  email: emailField(),
  // Verified accounts are signed in by the emailed link below; leave unverified to let the user verify themselves.
  emailVerified: z.boolean().default(false),
  sendWelcomeEmail: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  // `users:create` before the body is read. Roles are assigned afterwards, through `@frigear-nu/authorization`.
  await authorizeUsersAdmin(event, 'create')
  const input = await readValidatedBody(event, bodySchema.parse)
  // Vouching for an address nobody confirmed is `users:manage` (session only).
  if (input.emailVerified) await authorize(event, USERS_MANAGE_PERMISSION)

  await assertEmailAvailable(input.email)

  const [user] = await db.insert(schema.users).values({
    name: input.name,
    email: input.email,
    emailVerifiedAt: input.emailVerified ? new Date() : null,
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
