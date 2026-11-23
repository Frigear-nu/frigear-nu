import type { Migration } from '../upgrade/migrate.ts'
import { authApi } from './api.ts'
import { accountComponents, adminComponents } from './components.ts'
import {
  accountPermission,
  adminPermission,
  authorizationRoles,
  authPermissions,
  mcpPermission,
  menuPermission,
  usersPermissions,
} from './permissions.ts'
import { authRoutes, eventsTicketsPage, usersRoutes } from './routes.ts'
import { authSessionSecret } from './session.ts'

/**
 * Every breaking change a consuming app has to handle, oldest first. A release with a breaking change adds an entry
 * here (`since` = the first version with the change), so `frigear-nu upgrade` carries it to every app.
 */
export const migrations: Migration[] = [
  authRoutes,
  usersRoutes,
  adminComponents,
  accountComponents,
  authApi,
  authSessionSecret,
  menuPermission,
  mcpPermission,
  adminPermission,
  authPermissions,
  authorizationRoles,
  accountPermission,
  usersPermissions,
  eventsTicketsPage,
]
