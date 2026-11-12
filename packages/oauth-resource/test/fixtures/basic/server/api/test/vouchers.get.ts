// A service route: needs `vouchers:read`, from a frigear.nu token's permissions (or a session, where it is implicit).
export default defineEventHandler(async (event) => {
  const principal = await authorize(event, 'vouchers:read')
  return {
    kind: principal.kind,
    userId: principal.user.id,
    email: principal.user.email,
    name: principal.user.name,
    clientId: principal.kind === 'oauth' ? principal.client.id : null,
    scopes: principal.scopes,
    permissions: principal.permissions ?? null,
    foreign: principal.foreign ?? false,
  }
})
