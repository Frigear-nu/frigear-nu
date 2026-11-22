import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { usersAccess } from '../../../access'
import { emailField, nameField, phoneField } from '../../schemas'

const bodySchema = z.object({
  name: nameField().optional(),
  email: emailField().optional(),
  emailVerified: z.boolean().optional(),
  // `null` or an empty string clears it; changing it needs `users:pii` as well.
  phone: phoneField().optional(),
})

export default defineEventHandler(async (event) => {
  // `users:update` (outright, then on the target, with target protection) before the body is read or the user looked up.
  const { target } = await loadUsersAdminTarget(event, 'update')
  const input = await readValidatedBody(event, bodySchema.parse)

  // A legacy mixed-case address resubmitted in lowercase is not a change.
  const emailChanged = !!input.email && !sameUserEmail(input.email, target.email)
  // The address someone signs in with is theirs: changing or verifying it is `users:manage` (session only).
  if (emailChanged || input.emailVerified !== undefined) await authorize(event, USERS_MANAGE_PERMISSION, target)
  if (emailChanged) await assertEmailAvailable(input.email!, { exceptUserId: target.id })
  // The phone number is personal data: reading or changing it is `users:pii`. Checked whenever the body names it,
  // before it is compared with the stored number, so the answer (200 or 403) never tells whether a guess matched.
  if (input.phone !== undefined) await authorize(event, usersAccess.permissions.pii, target)
  const phoneChanged = input.phone !== undefined && input.phone !== (target.phone ?? null)
  const pii = input.phone !== undefined || await allows(event, usersAccess.permissions.pii, target)

  const changes = {
    ...(input.name ? { name: input.name } : {}),
    ...(phoneChanged ? { phone: input.phone } : {}),
    // A changed address was typed in by staff, so it is unverified until its owner confirms it (unless staff
    // explicitly marks it verified in the same request).
    ...(emailChanged ? { email: input.email, emailVerifiedAt: input.emailVerified ? new Date() : null } : {}),
    ...(!emailChanged && input.emailVerified !== undefined
      ? { emailVerifiedAt: input.emailVerified ? (target.emailVerifiedAt ?? new Date()) : null }
      : {}),
  } as Partial<typeof schema.users.$inferInsert>
  // Nothing to write (e.g. the same address resubmitted in another case): answer the user as stored.
  if (!Object.keys(changes).length) return toAdminUserDto(target, { pii })

  const [updated] = await db.update(schema.users).set(changes).where(eq(schema.users.id, target.id)).returning()

  // Ask the new address's owner to confirm it.
  if (emailChanged && !input.emailVerified) {
    await sendVerificationLink(event, updated!)
  }

  return toAdminUserDto(updated!, { pii })
})
