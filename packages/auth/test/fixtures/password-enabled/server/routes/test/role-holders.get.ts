// Who holds `admin`: there is no role provider (no `@frigear-nu/authorization`), so nobody is listed.
export default defineEventHandler(async event => ({ holders: await listRoleHolders(event, ['admin']) }))
