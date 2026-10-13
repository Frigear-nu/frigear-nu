import type { AuthStoredUser } from '../../types'

export type FrigearProfile = {
  email: string
  name?: string
  picture?: string
  emailVerified?: boolean
  // The frigear.nu user id (`sub`); only used when `forceId` is on.
  id?: number
}

/**
 * Finds or creates the local user for a verified frigear.nu profile. Without `forceId` users are matched by email.
 * With `forceId` the local id is the frigear.nu id: a user with that id is updated; otherwise a user with the same
 * email is re-keyed to it (its relations follow, and whoever held the id is moved aside); otherwise a user is created
 * with that id.
 */
export async function syncFrigearUser(profile: FrigearProfile, options: { forceId: boolean }): Promise<AuthStoredUser> {
  const users = useAuthUserStore()
  const { email } = profile
  const verifiedAt = profile.emailVerified ? new Date() : undefined
  const fields = {
    name: profile.name || email,
    email,
    avatar: profile.picture,
    lastLoginAt: new Date(),
  }

  if (options.forceId) {
    const id = profile.id
    if (!Number.isSafeInteger(id) || id! <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'frigear.nu did not return a numeric user id.' })
    }

    const byEmail = await users.findByEmail(email)
    if (byEmail && byEmail.id !== id) await users.changeId(byEmail.id, id!)

    const user = byEmail ?? await users.findById(id!)
    if (!user) return users.create({ id, name: fields.name, email, avatar: fields.avatar, emailVerifiedAt: verifiedAt })

    return (await users.update(id!, { ...fields, emailVerifiedAt: user.emailVerifiedAt ?? verifiedAt }))!
  }

  const user = await users.findByEmail(email)
  if (!user) return users.create({ name: fields.name, email, avatar: fields.avatar, emailVerifiedAt: verifiedAt })

  return await users.update(user.id, { lastLoginAt: fields.lastLoginAt, emailVerifiedAt: user.emailVerifiedAt ?? verifiedAt }) ?? user
}
