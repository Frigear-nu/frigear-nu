// A session without a user store, for the server-mode `$api` 401 test.
export default defineEventHandler(async (event) => {
  await setUserSession(event, { user: { id: 1, name: 'Ada' } as never })
  return { ok: true }
})
