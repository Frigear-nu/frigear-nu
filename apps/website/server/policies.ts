import type { H3Event } from 'h3'
import type { AuthUser } from '@frigear-nu/auth/utils'
import { allowsStaffAddressWrite } from '#shared/acl'

// Server policies of the app (`authorization.policies.server`), on top of the roles in nuxt.config.ts.

/** The `email` of a create or update body (h3 caches the parsed body, so the route can read it again). */
async function bodyEmail(event: H3Event): Promise<string | undefined> {
  if (!['POST', 'PUT', 'PATCH'].includes(event.method)) return undefined
  const body = await readBody<{ email?: unknown } | undefined>(event).catch(() => undefined)
  return typeof body?.email === 'string' ? body.email : undefined
}

/**
 * An address in NUXT_ACL_ADMINS makes the account an admin once it is verified, so only admins may write one: creating
 * a user (`users:create`) and changing or verifying an address (`users:manage`). Staff acting on an account that is
 * already an admin are stopped by the users admin's target protection, which counts the roles of `authorization:roles`.
 */
const staffAddressPolicy = async ({ event, user }: { event: H3Event, user: AuthUser }) => {
  const email = await bodyEmail(event)
  if (!email) return undefined
  const isAdmin = (await getEffectiveRoles(event, user)).includes('admin')
  return allowsStaffAddressWrite(isAdmin, email, aclAdmins()) ? undefined : false
}

export default [
  definePolicy('users:create', staffAddressPolicy, { withoutRecord: true }),
  definePolicy('users:manage', staffAddressPolicy, { withoutRecord: true }),
]
