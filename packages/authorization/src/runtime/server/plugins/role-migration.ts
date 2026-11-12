import { ensureAuthorizationRoleMigration } from '../utils/authorization-roles'

// Copies `users.role` into `authorization_user_roles` once (`runAuthorizationRoleMigration`). It runs on the first
// request rather than at startup, so NuxtHub has applied the migrations by then; later requests await a settled promise.
// Never while prerendering: there is no database binding then, and the prerendered pages hold no roles. A request
// that finds no database leaves the migration for the next one (`ensureAuthorizationRoleMigration`).
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return
  nitroApp.hooks.hook('request', async (event) => {
    if (getRequestHeader(event, 'x-nitro-prerender')) return
    await ensureAuthorizationRoleMigration()
  })
})
