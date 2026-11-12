import { db } from '@nuxthub/db'
// Loads the `oauth:*` hook types (Nitro's server tsconfig does not include module types).
import type {} from '@frigear-nu/oauth-server'

// Host policy of `@frigear-nu/oauth-server`. Who manages applications is the role's (`oauth:manage`: admins). Identify
// the caller from `ctx.userId`, never from the session: the session is empty for bearer requests.
export default defineNitroPlugin((nitro) => {
  // The roles an application's `allowedRoles` are checked against. The mobile client has none, so every signed-in
  // user may use it; restrict it with `allowedRoles: ['admin']` in nuxt.config.ts.
  nitro.hooks.hook('oauth:user:roles', async (ctx) => {
    const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (user) ctx.roles.push(effectiveRole(user))
  })
})
