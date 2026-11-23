import { z } from 'zod'

// Test-only: fires `inbox:thread:linked` as another module would (crew's "Add to crew"), for the signed-in caller.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { threadId, label } = await readValidatedBody(event, z.object({ threadId: z.string(), label: z.string() }).parse)
  await useNitroApp().hooks.callHook('inbox:thread:linked', { event, threadId, actorId: Number(principal.user.id), module: 'crew', kind: 'crew-member', label, userId: 42 })
  return { ok: true }
})
