// Test-only: sets (or, with `value: null`, removes) a server environment variable, such as `NUXT_CAMPAIGNS_RATE_LIMIT`.
// The runtime config of every later request reads it.
export default defineEventHandler(async (event) => {
  const { name, value } = await readBody<{ name: string, value: string | null }>(event)
  if (!name.startsWith('NUXT_CAMPAIGNS_')) throw createError({ statusCode: 400 })
  if (value === null) Reflect.deleteProperty(process.env, name)
  else process.env[name] = value
  return { ok: true }
})
