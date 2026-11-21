// Records what shifts fires and sends, for the tests: the shifts hooks, and the emails notify is asked to deliver (the
// driver itself is notify's `log` driver).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('shifts:schedule:published', (ctx) => {
    testHooks.push({ name: 'schedule:published', scheduleId: ctx.schedule.id, status: ctx.schedule.status })
  })
  nitro.hooks.hook('shifts:shift:created', (ctx) => {
    testHooks.push({ name: 'shift:created', shiftId: ctx.shift.id, scheduleId: ctx.shift.scheduleId })
  })
  nitro.hooks.hook('shifts:shift:updated', (ctx) => {
    testHooks.push({ name: 'shift:updated', shiftId: ctx.shift.id, scheduleId: ctx.shift.scheduleId })
  })
  nitro.hooks.hook('shifts:assignment:changed', (ctx) => {
    testHooks.push({
      name: 'assignment:changed',
      assignmentId: ctx.assignment.id,
      shiftId: ctx.assignment.shiftId,
      userId: ctx.assignment.userId,
      status: ctx.assignment.status,
      previousUserId: ctx.previous?.userId ?? null,
      previousStatus: ctx.previous?.status ?? null,
    })
  })
  for (const name of ['offered', 'accepted', 'rejected', 'completed'] as const) {
    nitro.hooks.hook(`shifts:swap:${name}`, (ctx) => {
      testHooks.push({ name: `swap:${name}`, swapId: ctx.swap.id, offerId: ctx.offer.id, userId: ctx.offer.userId, status: ctx.swap.status })
    })
  }
  nitro.hooks.hook('shifts:attendance:marked', (ctx) => {
    testHooks.push({ name: 'attendance:marked', assignmentId: ctx.assignment.id, userId: ctx.assignment.userId, status: ctx.assignment.status, by: ctx.by })
  })
  nitro.hooks.hook('notify:email', (ctx) => {
    const { to, subject, body, text, template } = ctx.notification
    testEmails.push({ to, subject, body, text, template: template ? { name: template.name, props: template.props, locale: template.locale } : undefined })
  })
})
