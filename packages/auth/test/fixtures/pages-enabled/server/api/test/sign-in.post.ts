// A session without a user store, for the server-mode `$api` 401 test.
export default defineEventHandler(async (event) => {
  // Signs in the way the app does: a new session, stamped with `signedInAt` (refused without it).
  await startAuthSession(event, { id: 1, name: 'Ada' })
  return { ok: true }
})
