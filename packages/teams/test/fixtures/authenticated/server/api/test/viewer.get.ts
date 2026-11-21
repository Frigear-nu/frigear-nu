import { resolveViewer } from '@frigear-nu/audience/server'

// Test-only: the viewer a visibility consumer (faq, maps) builds, without importing teams: for the caller (cookie or
// bearer), or for `?userId=` (another user, as a staff screen might).
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  const { userId } = getQuery(event) as { userId?: string }
  const user = userId ? await loadAuthUser(userId) : principal.user
  if (!user) throw createError({ statusCode: 404 })
  return resolveViewer(event, {
    hooks: useNitroApp().hooks,
    user,
    globalRoles: await getEffectiveRoles(event, user),
  })
})
