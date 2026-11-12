import { ensureAuthorizationRoleMigration } from '../utils/authorization-roles'

// Copies `users.role` into `authorization_user_roles` once (`runAuthorizationRoleMigration`). It runs on the first
// request rather than at startup, so NuxtHub has applied the migrations by then; later requests await a settled promise.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async () => {
    await ensureAuthorizationRoleMigration()
  })
})
