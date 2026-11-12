import { getTestUser } from '../../utils/test-users'

export default defineEventHandler(async (event) => {
  const { id } = await readBody<{ id: string }>(event)
  const user = getTestUser(String(id))
  if (!user) throw createError({ statusCode: 404 })
  // Signs in the way the app does: a new session, stamped with `signedInAt` (refused without it).
  await startAuthSession(event, user)
  return { ok: true }
})
