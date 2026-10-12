import { db } from '@nuxthub/db'

// Test-only host policy: anybody with an `@staff.test` email manages forms. It identifies the caller by
// `ctx.userId` (not by reading the session), so it applies to API tokens and cookie sessions alike.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.allowed = Boolean(actor?.email.endsWith('@staff.test'))
  })
})
