// Development only: a listener of a hook that access control no longer fires never runs, which fails silently. Say so.
const REMOVED_HOOKS: Record<string, string> = {
  'auth:user-permissions': 'roles (`authorization.roles`) or `authorization:before`',
  'auth:scope-available': '`authorization:before` (minting goes through `canGrantScope`)',
  'authorization:role': '`authorization:roles`',
  'authorization:authorize': '`authorization:before`',
  'events:authorize': '`authorization:before` or a policy (`definePolicy`) on the `events:*` permissions',
  'forms:authorize': '`authorization:before` or a policy (`definePolicy`) on the `forms:*` permissions',
  'payments:authorize': '`authorization:before` or a policy (`definePolicy`) on the `payments:*` permissions',
  'oauth:authorize': '`authorization:before` or a policy (`definePolicy`) on the `oauth:*` permissions',
  'users:admin:authorize': '`authorization:before` or a policy (`definePolicy`) on the `users:*` permissions',
  'users:admin:roles': 'roles in `authorization.roles` (the roles tab of the user admin)',
  'oauth:scope:staff': 'roles (`authorization.roles`) or `authorization:before` (consent goes through `canGrantScope`)',
  'oauth:user:roles': '`authorization:roles` (`allowedRoles` resolves through the role provider)',
}

export default defineNitroPlugin((nitroApp) => {
  // Listeners are registered by plugins; check once they all ran.
  queueMicrotask(() => {
    const hooks = (nitroApp.hooks as unknown as { _hooks?: Record<string, unknown[] | undefined> })._hooks ?? {}
    for (const [name, replacement] of Object.entries(REMOVED_HOOKS)) {
      if (hooks[name]?.length) console.warn(`[auth] The Nitro hook "${name}" has listeners, but it is no longer fired: use ${replacement}.`)
    }
  })
})
