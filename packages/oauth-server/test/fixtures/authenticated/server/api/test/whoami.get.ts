// An API route as any module would write it: it only asks `@frigear-nu/auth` who is calling and what they may do.
export default defineEventHandler(async (event) => {
  const principal = await authorize(event, 'groups:read')
  return {
    kind: principal.kind,
    userId: principal.user.id,
    scopes: principal.scopes,
    permissions: principal.permissions ?? null,
    clientId: principal.kind === 'oauth' ? principal.client.id : null,
  }
})
