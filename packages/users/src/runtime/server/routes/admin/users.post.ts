import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { apiError, conflict, created } from '@frigear-nu/module-kit/server'
import type { AuthStoredUser } from '@frigear-nu/auth/utils'
import { usersAccess } from '../../../access'
import { emailField, localeField, nameField, phoneField } from '../../schemas'

const bodySchema = (locales: readonly string[]) => z.object({
  name: nameField(),
  email: emailField(),
  // Optional, allowed with `users:create`: staff type it in once. Reading or changing it later is `users:pii`. Phone
  // numbers are not unique, so a number another user has is stored too and never answered differently.
  phone: phoneField().optional(),
  // The language to write to the user in: the creating staff member's current one (the admin UI sends it), or unset.
  locale: localeField(locales).optional(),
  // Verified accounts are signed in by the emailed link below; leave unverified to let the user verify themselves.
  emailVerified: z.boolean().default(false),
  // The invite: a single-use sign-in link, valid for `authentication.settings.inviteTtl` (7 days by default).
  sendWelcomeEmail: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  // `users:create` before the body is read. Roles are assigned afterwards, through `@frigear-nu/authorization`.
  await authorizeUsersAdmin(event, 'create')
  const input = await readValidatedBody(event, bodySchema(usersLocales()).parse)
  // Vouching for an address nobody confirmed is `users:manage` (session only).
  if (input.emailVerified) await authorize(event, USERS_MANAGE_PERMISSION)

  // A taken address answers 409 with the holder's id (`data.userId`), so a picker can offer that user instead. The
  // caller may create users and learns no more than that the address has an account.
  const holder = await findUserByEmail(input.email)
  if (holder) {
    throw conflict('A user with this email already exists.', { field: 'email', userId: holder.id })
  }

  const [user] = await db.insert(schema.users).values(withUserSearchText({
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    locale: input.locale ?? null,
    emailVerifiedAt: input.emailVerified ? new Date() : null,
  }) as typeof schema.users.$inferInsert).returning()

  if (!user) {
    throw apiError(500, 'internal_error', 'Failed to create the user.')
  }

  // `auth:user:created` (`source: 'admin'`): other modules set up what they keep for new accounts.
  await notifyAuthUserCreated({ event, user: user as AuthStoredUser, source: 'admin' })

  // The user has no password: the emailed single-use invite link (which also verifies the address) signs them in. In
  // Auth's resource mode people sign in at the issuer, which matches them to this user by their verified email, so no
  // link is sent.
  if (input.sendWelcomeEmail && useRuntimeConfig(event).public.authentication?.mode !== 'resource') {
    await sendVerificationLink(event, user, { invite: true })
  }

  // The phone number is in the answer with `users:pii` only, as in every other users admin response.
  return created(event, toAdminUserDto(user, { pii: await allows(event, usersAccess.permissions.pii) }))
})
