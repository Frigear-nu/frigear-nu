import { getTestUser } from '../../utils/test-users'

export default defineEventHandler(async (event) => {
  const { id } = await readBody<{ id: string }>(event)
  const user = getTestUser(String(id))
  if (!user) throw createError({ statusCode: 404 })
  await setUserSession(event, { user: user as never })
  return { ok: true }
})
