import type { H3Event } from 'h3'
import type { AuthStoredUser, AuthUserCreate } from '../../types'

export type FrigearProfile = {
  email: string
  name?: string
  picture?: string
  emailVerified?: boolean
  // The frigear.nu user id (`sub`); only used when `forceId` is on.
  id?: number
  /**
   * The local roles from frigear.nu's role claims (`mapRoleClaims`); only set when role syncing is on. They replace the
   * user's single sign-on roles (`setRoles` with source `sso`) and never touch roles assigned here.
   */
  roles?: string[]
}

/**
 * Finds or creates the local user for a verified frigear.nu profile. Without `forceId` users are matched by email.
 * With `forceId` the local id is the frigear.nu id: the user with that id and email is updated; otherwise a user with
 * the same email is re-keyed to it (its relations follow, and whoever held the id is moved aside); otherwise a user is
 * created with that id.
 *
 * An existing user is only matched (or re-keyed) by email when frigear.nu says the address is verified
 * (`emailVerified`); otherwise this throws 403 `frigear_email_unverified`. Under `forceId` a local user holding the id
 * under another email is never taken over: 409 `frigear_id_conflict`. A matched user that was never verified loses
 * the credentials set before (`clearUnverifiedAuthCredentials`) and is marked verified.
 */
export async function syncFrigearUser(profile: FrigearProfile, options: { forceId: boolean, event?: H3Event }): Promise<AuthStoredUser> {
  let created = false
  const user = await findOrCreateFrigearUser(profile, options, () => {
    created = true
  })
  // frigear.nu publishes effective roles (`admin` and everything it inherits); store only those that grant the rest.
  if (profile.roles) await setAuthUserRoles(user.id, withoutInheritedRoles(profile.roles), { source: 'sso' })
  // A new account: `auth:user:created`, once its roles are stored.
  if (created) await notifyAuthUserCreated({ event: options.event, user, source: 'frigear' })
  return user
}

async function findOrCreateFrigearUser(profile: FrigearProfile, options: { forceId: boolean }, onCreated: () => void): Promise<AuthStoredUser> {
  const users = useAuthUserStore()
  const create = async (values: AuthUserCreate) => {
    const user = await users.create(values)
    onCreated()
    return user
  }
  // Stored lowercased; lookups are case-insensitive, so accounts stored mixed-case still match.
  const email = profile.email.trim().toLowerCase()
  const verified = profile.emailVerified === true
  const now = new Date()
  const fields = {
    name: profile.name || email,
    email,
    avatar: profile.picture,
    lastLoginAt: now,
  }
  const refuseUnverified = () => createError({
    statusCode: 403,
    statusMessage: 'frigear.nu has not verified this email address, and an account with it already exists here.',
    data: { code: 'frigear_email_unverified' },
  })
  // The address is proven now: credentials set while the account was unverified go, then it is marked verified.
  const verifyExisting = async (user: AuthStoredUser) => {
    if (!verified || user.emailVerifiedAt) return {}
    await clearUnverifiedAuthCredentials(user.id)
    return { emailVerifiedAt: now }
  }

  if (options.forceId) {
    const id = profile.id
    if (!Number.isSafeInteger(id) || id! <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'frigear.nu did not return a numeric user id.' })
    }

    const byEmail = await users.findByEmail(email)
    if (byEmail) {
      // Already this frigear.nu user (same id and email): matched by id, not by email.
      if (byEmail.id === id) return (await users.update(id!, { ...fields, ...await verifyExisting(byEmail) }))!
      if (!verified) throw refuseUnverified()
      const verification = await verifyExisting(byEmail)
      // Whoever holds the id is moved aside to a fresh one.
      await users.changeId(byEmail.id, id!)
      return (await users.update(id!, { ...fields, ...verification }))!
    }

    // A local user holding this id under another address is someone else (e.g. a local sign-up): never take it over.
    if (await users.findById(id!)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A different account here already has this frigear.nu user id.',
        data: { code: 'frigear_id_conflict' },
      })
    }
    return create({ id, name: fields.name, email, avatar: fields.avatar, emailVerifiedAt: verified ? now : undefined })
  }

  const user = await users.findByEmail(email)
  if (!user) return create({ name: fields.name, email, avatar: fields.avatar, emailVerifiedAt: verified ? now : undefined })
  if (!verified) throw refuseUnverified()

  return await users.update(user.id, { lastLoginAt: now, ...await verifyExisting(user) }) ?? user
}
