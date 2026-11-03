import { db } from '@nuxthub/db'
// Loads the `oauth:*` hook types (Nitro's server tsconfig does not include module types).
import type {} from '@frigear-nu/oauth-server'

// Host policy of `@frigear-nu/oauth-server` (it has no role model of its own). Identify the caller from `ctx.userId`,
// never from the session: the session is empty for bearer requests.
export default defineNitroPlugin((nitro) => {
  // /admin/oauth and its API: admins only (denied unless a hook allows it).
  nitro.hooks.hook('oauth:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.allowed = !!actor && effectiveRole(actor) === 'admin'
  })

  // The roles an application's `allowedRoles` are checked against. The mobile client has none, so every signed-in
  // user may use it; restrict it with `allowedRoles: ['admin']` in nuxt.config.ts.
  nitro.hooks.hook('oauth:user:roles', async (ctx) => {
    const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (user) ctx.roles.push(effectiveRole(user))
  })
})
