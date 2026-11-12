// A staff change: `inventory:manage` is session only, so no access token ever has it.
export default defineEventHandler(async (event) => {
  await authorize(event, 'inventory:manage')
  return { ok: true }
})
