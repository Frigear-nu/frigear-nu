import { z } from 'zod'

// Test-only: sets (or, with `value: null`, removes) a `NUXT_INBOX_*` environment variable of the server. The runtime
// config is read per request with the environment applied, so this switches a webhook secret off for the next request.
export default defineEventHandler(async (event) => {
  const { name, value } = await readValidatedBody(event, z.object({ name: z.string().regex(/^NUXT_INBOX_[A-Z0-9_]+$/), value: z.string().nullable() }).parse)
  if (value === null) Reflect.deleteProperty(process.env, name)
  else process.env[name] = value
  return { ok: true }
})
