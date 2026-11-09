import type { H3Event } from 'h3'
import type { AuthUserPermissionsContext } from '../../../types'
import { configured as storeConfigured } from '#auth/user-store'
import { hasScope } from '../../utils/scopes'

type PermissionsUser = AuthUserPermissionsContext['user']

declare module 'h3' {
  interface H3EventContext {
    /** Permissions per user id, resolved once per request by `getAuthUserPermissions`. */
    authPermissions?: Map<number, Promise<string[] | null>>
  }
}

async function askPermissions(event: H3Event, user: PermissionsUser): Promise<string[] | null> {
  const ctx: AuthUserPermissionsContext = { event, user, permissions: null }
  try {
    await useNitroApp().hooks.callHook('auth:user-permissions', ctx)
  }
  catch (error) {
    // Fail closed: a broken access-control listener must not hand out everything.
    console.error('[auth] auth:user-permissions failed, denying every permission', error)
    return []
  }
  return Array.isArray(ctx.permissions) ? [...new Set(ctx.permissions.filter(scope => typeof scope === 'string'))] : null
}

/**
 * What `user` may do (role-based access control): the permissions an `auth:user-permissions` listener (normally
 * `@frigear-nu/authorization`) gives them, or `null` when no access control is installed and the user may do
 * everything. Resolved once per request and user. Pass the stored user (with its `role`), or an id to load it.
 */
export async function getAuthUserPermissions(event: H3Event, user: PermissionsUser | number): Promise<string[] | null> {
  const id = typeof user === 'number' ? user : user.id
  const cache = (event.context.authPermissions ??= new Map())
  let pending = cache.get(id)
  if (!pending) {
    pending = (async () => {
      let subject: PermissionsUser | null = typeof user === 'number' ? null : user
      if (!subject) {
        const stored = storeConfigured ? await useAuthUserStore().findById(id) : null
        subject = (stored as PermissionsUser | null) ?? { id }
      }
      return askPermissions(event, subject)
    })()
    cache.set(id, pending)
  }
  return pending
}

/** Whether `user` holds `permission` (wildcards as for scopes, `:pii` only by name). `true` without access control. */
export async function authUserCan(event: H3Event, user: PermissionsUser | number, permission: string): Promise<boolean> {
  const permissions = await getAuthUserPermissions(event, user)
  return permissions === null || hasScope(permissions, permission)
}
