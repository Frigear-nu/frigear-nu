// `@frigear-nu/auth/access`: framework-free, so a module's `access.ts` (and a host's `roles.ts`) can be imported from
// `module.ts`, `nuxt.config.ts`, server routes, tests and the client alike. No Nuxt, Vue, h3 or database imports here.
export { defineAccess, defineRoles } from './utils/access'
export type {
  Access,
  AccessInput,
  AccessPermission,
  AccessPermissionName,
  AccessRole,
  AccessScope,
  HostRole,
  Permission,
  PermissionGrant,
  RoleName,
} from './utils/access'
