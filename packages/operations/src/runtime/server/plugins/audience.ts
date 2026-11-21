import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Answers `audience:owner:resolve` for the `operation` owner type, so modules that own records per operation (maps,
// faq, help center) can label and validate an owner without importing this module. Operations stores no participants,
// so it does not answer `audience:viewer:resolve`: crew fills `viewer.operationIds`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:owner:resolve', async (ctx) => {
    if (ctx.owner.type !== 'operation') return
    if (!ctx.owner.id) {
      ctx.exists = false
      return
    }
    const [row] = await db.select({ name: schema.operations.name }).from(schema.operations)
      .where(eq(schema.operations.id, ctx.owner.id)).limit(1)
    ctx.exists = !!row
    if (row) ctx.label = row.name
  })
})
