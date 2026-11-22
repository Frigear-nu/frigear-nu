// Shifts' answer to people leaving a team or changing role on it (teams fires these from its own routes, crew when a
// grant starts or stops). Only teams an operation owns hold shifts.
//   `teams:member:removed`: the person's future `assigned` assignments on the team are cancelled.
//   `teams:member:role-changed`: the future ones whose shift role the new team role no longer meets are cancelled.
// Each cancellation fires `shifts:assignment:changed` and cancels the assignment's swap. A failure is logged: the team
// change itself has happened already.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('teams:member:removed', async (ctx) => {
    if (ctx.team.ownerType !== 'operation') return
    try {
      await shiftsCancelFutureAssignments(ctx.event, ctx.member.userId, ctx.team.id)
    }
    catch (error) {
      console.error('[shifts] the shifts of a person who left a team could not be cancelled', error)
    }
  })
  nitro.hooks.hook('teams:member:role-changed', async (ctx) => {
    if (ctx.team.ownerType !== 'operation') return
    try {
      // The role just changed: resolve the grants again rather than from this request's cache.
      forgetTeamRoles(ctx.event)
      await shiftsCancelFutureAssignments(ctx.event, ctx.member.userId, ctx.team.id, assignment => shiftsStillEligible(ctx.event, assignment, ctx.team.id))
    }
    catch (error) {
      console.error('[shifts] the shifts of a person whose team role changed could not be checked', error)
    }
  })
})
