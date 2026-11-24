// GET /api/me (local mode): the signed-in user, from the session cookie of the bundled server. The remote SPA calls the
// issuer's API instead. Return an allowlisted object, never the database row.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { id: user.id, name: user.name, email: user.email }
})
