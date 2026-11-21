import { resolveViewer } from '@frigear-nu/audience/server'

// Test-only: the viewer a visibility consumer (faq, maps) builds, without importing crew or teams: for the caller (cookie
// or bearer).
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  return resolveViewer(event, {
    hooks: useNitroApp().hooks,
    user: principal.user,
    globalRoles: await getEffectiveRoles(event, principal.user),
  })
})
