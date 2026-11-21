// Test-only: fires `operations:created` again for an existing operation, the way a retry would.
export default defineEventHandler(async (event) => {
  const { id } = await readBody<{ id: string }>(event)
  const row = await getOperationOr404(id)
  await useNitroApp().hooks.callHook('operations:created', { event, operation: operationHookDto(row) })
  return { ok: true }
})
