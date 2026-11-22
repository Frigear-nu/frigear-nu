// Stores the module option's ladders (and the generic `default` ladder) in `team_role_ladders` once, insert-if-missing, so
// admins can edit them. It runs on the first request rather than at startup, so NuxtHub has applied the migrations by
// then; later requests await a settled promise. Never while prerendering: there is no database binding then. Until a
// kind is stored, the option's ladder applies (`loadTeamLadders`).
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return
  nitroApp.hooks.hook('request', async (event) => {
    if (getRequestHeader(event, 'x-nitro-prerender')) return
    await ensureTeamLaddersSeeded()
  })
})
