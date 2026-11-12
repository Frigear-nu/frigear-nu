import type { AuthUserPermissionsContext } from '@frigear-nu/auth/utils'

type UsersAdminAuthorizeContext = {
  event: AuthUserPermissionsContext['event']
  userId: number
  action: 'view' | 'create' | 'update' | 'delete'
  input?: { role?: string }
  target?: { id: number, role?: string }
  allowed: boolean
}
type UsersAdminRolesContext = { event: AuthUserPermissionsContext['event'], userId: number, roles: string[] }

// Role-based access control (`rbac: true`): this plugin is the decision point of `@frigear-nu/auth`. A user's
// permissions are their role's; credentials act within them, staff gates start from them.
export default defineNitroPlugin((nitroApp) => {
  const actorRole = async (event: AuthUserPermissionsContext['event'], userId: number) => {
    const stored = await useAuthUserStore().findById(userId)
    return stored ? (await resolveAuthorizationRole(event, stored))?.name : undefined
  }

  nitroApp.hooks.hook('auth:user-permissions', async (ctx: AuthUserPermissionsContext) => {
    const role = await resolveAuthorizationRole(ctx.event, ctx.user)
    if (role) ctx.permissions = [...role.permissions]
  })

  // Users admin: the role select lists the roles below the actor's own, and nobody gives or changes a role at or
  // above their own (admins may manage admins). The permission (`users:read` / `users:manage`) decides the rest.
  const hooks = nitroApp.hooks as unknown as {
    hook: (name: string, handler: (ctx: never) => unknown) => void
  }
  hooks.hook('users:admin:roles', async (ctx: UsersAdminRolesContext) => {
    const actor = await actorRole(ctx.event, ctx.userId)
    ctx.roles = (useAuthorizationRoles()?.roles ?? [])
      .map(role => role.name)
      .filter(role => canAssignAuthorizationRole(actor, role))
  })
  hooks.hook('users:admin:authorize', async (ctx: UsersAdminAuthorizeContext) => {
    if (!ctx.allowed || ctx.action === 'view') return
    const touchesRole = ctx.input?.role !== undefined || ctx.target?.role !== undefined
    if (!touchesRole) return
    const actor = await actorRole(ctx.event, ctx.userId)
    if (ctx.input?.role !== undefined && !canAssignAuthorizationRole(actor, ctx.input.role)) ctx.allowed = false
    if (ctx.target?.role !== undefined && !canAssignAuthorizationRole(actor, ctx.target.role)) ctx.allowed = false
  })
})
