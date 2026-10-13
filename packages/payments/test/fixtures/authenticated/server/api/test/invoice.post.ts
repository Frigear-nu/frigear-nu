// Test-only: stands in for `@frigear-nu/subscriptions`, which announces membership invoices through this hook.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const invoice = { ...body, paidAt: body.paidAt ? new Date(body.paidAt) : null }
  await useNitroApp().hooks.callHook('subscriptions:invoice' as never, { invoice } as never)
  return { ok: true }
})
