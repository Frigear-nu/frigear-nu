// GET /api/me: the signed-in user. Works with the session cookie and with the access token apps/mobile sends as
// `Authorization: Bearer` (oauthServer.cors.paths opens /api/ to the app's origins). Return an allowlisted object,
// never the database row.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { id: user.id, name: user.name, email: user.email }
})
