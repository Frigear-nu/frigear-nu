// Crew's answer to who takes part in an operation, always on: a person whose membership on a team the operation owns
// grants (approved crew, or a member added by hand in teams). Applied, waitlisted, rejected and withdrawn people do not
// take part. Operations uses it for `operations:read`, `/api/operations/me` and the `operation` grant kind.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('operations:participation:resolve', async (ctx) => {
    // The user comes from `ctx.user`, never from the session: bearer requests have none.
    try {
      for (const id of await crewParticipationOperationIds(Number(ctx.user.id))) ctx.operationIds.add(id)
    }
    catch (error) {
      // Fail closed: without its crew memberships the user takes part in less, never more.
      console.error('[crew] the operations a user takes part in could not be read; crew adds none', error)
    }
  })

  nitro.hooks.hook('operations:participants:resolve', async (ctx) => {
    try {
      for (const id of await crewOperationParticipants(ctx.operationIds)) ctx.userIds.add(id)
    }
    catch (error) {
      console.error('[crew] the participants of operations could not be read; crew adds none', error)
    }
  })
})
