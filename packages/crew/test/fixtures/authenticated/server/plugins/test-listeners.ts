// Records what crew fires and sends, for the tests: the crew and teams member hooks, and the emails notify is asked to
// deliver (the driver itself is notify's `log` driver).
export default defineNitroPlugin((nitro) => {
  for (const name of ['applied', 'approved', 'rejected', 'waitlisted', 'withdrawn'] as const) {
    nitro.hooks.hook(`crew:member:${name}`, (ctx) => {
      testHooks.push({ name: `crew:${name}`, operationId: ctx.operationId, teamId: ctx.member.teamId, userId: ctx.member.userId, role: ctx.member.role, crewStatus: ctx.member.crewStatus })
      // A listener that fails after the membership was written: the invite use it spent must stay spent.
      if (name === 'approved' && ctx.member.email?.startsWith('hookfail')) throw new Error('test: a crew:member:approved listener failed')
    })
  }
  nitro.hooks.hook('teams:member:added', (ctx) => {
    testHooks.push({ name: 'teams:added', teamId: ctx.team.id, userId: ctx.member.userId, role: ctx.member.role })
  })
  nitro.hooks.hook('teams:member:removed', (ctx) => {
    testHooks.push({ name: 'teams:removed', teamId: ctx.team.id, userId: ctx.member.userId, role: ctx.member.role })
  })
  nitro.hooks.hook('teams:member:role-changed', (ctx) => {
    testHooks.push({ name: 'teams:role-changed', teamId: ctx.team.id, userId: ctx.member.userId, role: ctx.member.role, from: ctx.from, to: ctx.to })
  })
  nitro.hooks.hook('notify:email', (ctx) => {
    const { to, subject, body, text, template } = ctx.notification
    testEmails.push({ to, subject, body, text, template: template ? { name: template.name, props: template.props, locale: template.locale } : undefined })
  })
})
