import { idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AuthorizationRoleDto } from '../../../../types'
import { toRoleDetail } from '../../../utils/roles-view'

// `GET /api/admin/authorization/roles/:name`: one role with every registered permission and why it holds it.
export default defineEventHandler(async (event): Promise<AuthorizationRoleDto> => {
  await authorize(event, 'roles:read')
  const { name } = await getValidatedRouterParams(event, idParams('name').parse)
  const { table, registry } = useAuthorizationAccessTables()
  const role = Object.hasOwn(table.roles, name) ? table.roles[name] : undefined
  if (!role) throw notFound(`Role "${name}" does not exist.`)
  const counts = await countAuthorizationRoleUsers()
  return toRoleDetail(role, counts.get(role.name) ?? 0, table, registry)
})
