export default defineEventHandler(async (event) => {
  await setUserSession(event, { user: { id: 1, name: 'Ada' } as never })
  return { ok: true }
})
