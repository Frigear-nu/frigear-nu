// `auth:user:created` listeners of `tokens.test.ts`: one records every call (read back from `/api/test/created`), one
// throws when the registration's extras ask it to, which must not stop the sign-up.
export default defineNitroPlugin((nitroApp) => {
  const g = globalThis as { __authCreated?: Array<Record<string, unknown>> }
  nitroApp.hooks.hook('auth:user:created', (ctx) => {
    (g.__authCreated ||= []).push({ userId: ctx.user.id, email: ctx.user.email, source: ctx.source, extras: ctx.extras, hasEvent: !!ctx.event })
  })
  nitroApp.hooks.hook('auth:user:created', (ctx) => {
    if ((ctx.extras?.test as { fail?: boolean } | undefined)?.fail) throw new Error('a broken listener')
  })
})
