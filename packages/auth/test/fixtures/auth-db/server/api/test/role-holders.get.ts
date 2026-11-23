// Who holds `admin`: the fixture's role provider has no `holders`, so nobody is listed (fail closed).
export default defineEventHandler(async event => ({ holders: await listRoleHolders(event, ['admin']) }))
