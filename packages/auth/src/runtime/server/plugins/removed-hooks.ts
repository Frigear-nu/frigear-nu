// Development only: a listener of a hook that access control no longer fires never runs, which fails silently. Say so.
// The module hooks (`events:authorize`, `users:admin:authorize`, ...) join this list in phase 2: the deprecated staff
// gates (`definePolicyGate`) still fire them until their modules move to `authorize`.
const REMOVED_HOOKS: Record<string, string> = {
  'auth:user-permissions': 'roles (`authorization.roles`) or `authorization:before`',
  'auth:scope-available': '`authorization:before` (minting goes through `canGrantScope`)',
  'authorization:role': '`authorization:roles`',
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
