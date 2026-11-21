// Crew's answer to the audience contract, always on (audience is a hard dependency): `audience:viewer:resolve` puts the
// operations the user is approved crew of into `viewer.operationIds`. Only an approved person takes part: applied,
// waitlisted, rejected and withdrawn people are not in it. Operations answers `operations/me` and `takesPart` from it.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:viewer:resolve', async (ctx) => {
    // The user comes from `ctx.user`, never from the session: bearer requests have none.
    try {
      const ids = await crewApprovedOperationIds(Number(ctx.user.id))
      for (const id of ids) if (!ctx.viewer.operationIds.includes(id)) ctx.viewer.operationIds.push(id)
    }
    catch (error) {
      // Fail closed: without its crew memberships the viewer takes part in less, never more.
      console.error('[crew] the operations of the viewer could not be resolved; the viewer gets none from crew', error)
    }
  })
})
