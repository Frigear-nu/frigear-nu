// Added only when `@frigear-nu/maps` is installed (`module.ts`). A team's leads may draw on the maps the team owns
// (`ownerType: 'team'`). Staff keep editing through `maps:manage`, and everyone else is refused by maps itself.
export default defineNitroPlugin((nitro) => {
  // The user is `ctx.user`: the event's session is empty for bearer requests.
  nitro.hooks.hook('maps:edit:resolve', async (ctx) => {
    if (ctx.map.ownerType !== 'team' || !ctx.map.ownerId) return
    if (await isTeamLead(ctx.event, ctx.user.id, ctx.map.ownerId)) ctx.allowed = true
  })
})
