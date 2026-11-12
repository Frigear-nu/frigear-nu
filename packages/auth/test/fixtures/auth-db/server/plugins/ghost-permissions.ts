import type { AuthUserPermissionsContext } from '../../../../../src/types'

// Access control for `ghost_` bearers only, so the other suites keep running without a ceiling: an admin may do
// everything, anyone else only read events. The role is the stored user's, as `resolveBearer` passes it.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('auth:user-permissions', (ctx: AuthUserPermissionsContext) => {
    if (!getRequestHeader(ctx.event, 'authorization')?.startsWith('Bearer ghost_')) return
    ctx.permissions = ctx.user.role === 'admin' ? ['*'] : ['events:read']
  })
})
