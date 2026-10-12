import { resolveBearer } from '../utils/auth'

// Resolves bearer credentials early so `event.context.auth` is set for every handler, including
// other modules' route-rule middleware. Cookie sessions are resolved lazily by `getAuth`.
export default defineEventHandler(async (event) => {
  await resolveBearer(event)
})
