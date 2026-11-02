// A service route: needs a frigear.nu token (or a session) with `vouchers:read`.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event, { scopes: ['vouchers:read'] })
  return {
    kind: principal.kind,
    userId: principal.user.id,
    email: principal.user.email,
    name: principal.user.name,
    clientId: principal.kind === 'oauth' ? principal.client.id : null,
    scopes: principal.scopes,
  }
})
