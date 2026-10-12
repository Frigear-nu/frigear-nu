// An API route as any module would write it: it only asks `@frigear-nu/auth` who is calling.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event, { scopes: ['groups'] })
  return {
    kind: principal.kind,
    userId: principal.user.id,
    scopes: principal.scopes,
    clientId: principal.kind === 'oauth' ? principal.client.id : null,
  }
})
