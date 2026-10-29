import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { emailField, nameField } from '../../schemas'

const bodySchema = z.object({
  name: nameField().optional(),
  email: emailField().optional(),
  role: z.string().trim().min(1).max(60).optional(),
  emailVerified: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  // Authorizes `update` (outright, then on the target) before the body is read or the user looked up.
  const { target } = await loadUsersAdminTarget(event, 'update')
  const input = await readValidatedBody(event, bodySchema.parse)
  const withRole = usersHaveRoles()

  // The host decides on the values too (e.g. which roles this staff member may hand out).
  await authorizeUsersAdmin(event, 'update', {
    input: { role: withRole ? input.role : undefined, email: input.email, name: input.name },
    target: usersAdminTargetInfo(target),
  })

  // A legacy mixed-case address resubmitted in lowercase is not a change.
  const emailChanged = !!input.email && !sameUserEmail(input.email, target.email)
  if (emailChanged) await assertEmailAvailable(input.email!, { exceptUserId: target.id })

  const changes = {
    ...(input.name ? { name: input.name } : {}),
    // A changed address was typed in by staff, so it is unverified until its owner confirms it (unless staff
    // explicitly marks it verified in the same request).
    ...(emailChanged ? { email: input.email, emailVerifiedAt: input.emailVerified ? new Date() : null } : {}),
    ...(!emailChanged && input.emailVerified !== undefined
      ? { emailVerifiedAt: input.emailVerified ? (target.emailVerifiedAt ?? new Date()) : null }
      : {}),
    ...(withRole && input.role ? { role: input.role } : {}),
  } as Partial<typeof schema.users.$inferInsert>
  // Nothing to write (e.g. the same address resubmitted in another case): answer the user as stored.
  if (!Object.keys(changes).length) return toAdminUserDto(target)

  const [updated] = await db.update(schema.users).set(changes).where(eq(schema.users.id, target.id)).returning()

  // Ask the new address's owner to confirm it.
  if (emailChanged && !input.emailVerified) {
    await sendVerificationLink(event, updated!)
  }

  return toAdminUserDto(updated!)
})
