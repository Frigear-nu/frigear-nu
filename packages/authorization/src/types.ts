import type { HostRole, RoleName } from '@frigear-nu/auth/access'
import type { AuthRoleSource } from '@frigear-nu/auth/utils'
import type { AuthorizeMeta, RouteRule } from './runtime/utils/types'

export type { AuthorizeMeta, AuthorizationResponse, RouteRule } from './runtime/utils/types'

/**
 * A host role (`authorization.roles[name]`): grants are typed against the registered permissions and `inherit` against
 * the roles once the app's types are generated (`defineRoles` from `@frigear-nu/auth/access` also types `inherit`
 * against the roles of the same object before that).
 */
export type AuthorizationRoleOptions = HostRole

export interface ModuleOptions {
  /**
   * The app's roles: what each grants (`grant`, permission names or wildcards; `*` never covers sensitive permissions),
   * the roles it inherits (`inherit`), `requirements` that must hold for it to count and `auto` (held by everyone who
   * meets the requirements). A role defined here merges into a module's role of the same name: its label,
   * description, requirements and `auto` win, `grant` and `inherit` are unioned. `replace: true` drops the module's
   * definition (and the module grants into it) instead.
   *
   * ```ts
   * roles: defineRoles({
   *   admin: { label: 'Admin', grant: ['*'] },
   *   editor: { label: 'Editor', grant: ['posts:*'], inherit: ['user'] },
   *   user: { label: 'User', grant: ['posts:read'] },
   * })
   * ```
   */
  roles?: Record<string, AuthorizationRoleOptions>
  /** Roles every signed-in user holds (never `auto` roles). They cannot be assigned. */
  defaultRoles?: RoleName[]
  /**
   * Where to send unauthenticated visitors on page navigation. Defaults to Auth's login path in client mode; omit it in
   * server mode, or set `false` in client mode, to show a 401 error instead.
   */
  redirectTo?: string | false
  /**
   * The host's policy files. `shared` (`defineSharedPolicy` from `@frigear-nu/auth/policies`) runs on the server and in
   * the client's `can()`; `server` (`definePolicy`) only on the server. Paths are relative to the app root. Defaults to
   * `shared/policies.ts` and `server/policies.ts` when they exist; `false` turns a file off.
   */
  policies?: {
    shared?: string | false
    server?: string | false
  }
}

/**
 * Authorization keys that go directly on a `routeRules` entry: `permission`, `authenticated`, `guest`. Auth's server
 * middleware enforces them for `/api/**`, the page middleware for pages.
 */
export type AuthorizationRouteRules = RouteRule

export interface PublicModuleOptions {
  /** The authorization keys of `routeRules`, collected at build time. */
  routes?: Record<string, AuthorizationRouteRules>
  /** Auth's anonymous entry points (`public.authentication.publicPaths`): less specific guards stop there. */
  exempt?: string[]
  redirectTo?: string
  /** Client mode: there is no server here, access comes from the issuer. */
  client?: boolean
  /** The admin pages (with `@frigear-nu/admin`). */
  pages?: { roles?: string }
}

/** Why a role holds a permission (`null` when it does not). */
export type AuthorizationPermissionGrant
  = | { via: 'granted', by: string }
    | { via: 'inherited', from: string, by: string }
    | { via: 'implicit' }

/** One role of `GET /api/admin/authorization/roles`. */
export interface AuthorizationRoleSummaryDto {
  name: string
  label: string
  labelKey: string | null
  description: string | null
  descriptionKey: string | null
  /** Direct parents. */
  inherit: string[]
  /** Every role it inherits, transitively. */
  inherited: string[]
  /** Names of its requirements (`subscription`). */
  requirements: string[]
  /** Held by everyone who meets the requirements; never assigned. */
  auto: boolean
  /** Held by every signed-in user (`defaultRoles`); never assigned. */
  default: boolean
  assignable: boolean
  /** Users with an assigned row (default and `auto` roles are never stored: 0). */
  userCount: number
  /** Registered permissions it holds: granted, inherited and implicit (the role detail's held rows). */
  permissionCount: number
}

/** A registered permission as one role sees it. */
export interface AuthorizationRolePermissionDto {
  name: string
  label: string | null
  labelKey: string | null
  description: string | null
  descriptionKey: string | null
  group: string
  /** Never covered by a wildcard: only held when granted by name. */
  sensitive: boolean
  /** Only a cookie session may use it. */
  sessionOnly: boolean
  /** Every signed-in user holds it. */
  implicit: boolean
  grant: AuthorizationPermissionGrant | null
  /** Where the role's grant of it comes from (host config, a module, a module's `grantTo`, an inherited role). */
  sources: AuthorizationPermissionSource[]
}

/** Provenance of a role's permission, as auth compiled it. */
export interface AuthorizationPermissionSource {
  via: 'host' | 'module' | 'grantTo' | 'inherit'
  /** The module name (`module`, `grantTo`) or role name (`inherit`). */
  from?: string
}

/** `GET /api/admin/authorization/roles/:name`. */
export interface AuthorizationRoleDto extends AuthorizationRoleSummaryDto {
  /** Its own grants, as configured. */
  grant: string[]
  /** Every registered permission, held or not. */
  permissions: AuthorizationRolePermissionDto[]
}

/** One row of `GET /api/admin/authorization/roles/:name/users`. */
export interface AuthorizationRoleUserDto {
  id: number
  name: string
  email: string
  source: AuthRoleSource
  /** ISO date. */
  assignedAt: string
}

/** `GET /api/admin/authorization/roles/:name/users`. */
export interface AuthorizationRoleUsersPageDto {
  items: AuthorizationRoleUserDto[]
  total: number
  page: number
  pageSize: number
}

/** A stored role of a user. */
export interface AuthorizationAssignedRoleDto {
  role: string
  source: AuthRoleSource
  grantedBy: number | null
  /** ISO date. */
  assignedAt: string
  /** `false`: the role is not configured (any more); it is kept and ignored. */
  known: boolean
}

/** `GET` / `PUT /api/admin/authorization/users/:id/roles`. */
export interface AuthorizationUserRolesDto {
  userId: number
  /** The stored rows: `manual` and `migrated` ones are the admin's to change, `sso` ones follow single sign-on. */
  assigned: AuthorizationAssignedRoleDto[]
  /** Effective roles: assigned, default, `auto` and hook roles whose requirements hold, inheritance included. */
  effective: string[]
  /** Registered permissions the effective roles hold (implicit ones included; `authorization:before` not applied). */
  permissions: string[]
  /** Roles the caller may assign (they hold every permission of each); empty without `roles:assign`. */
  assignable: string[]
}

/** `PUT /api/admin/authorization/users/:id/roles`: the roles the user should hold through assignment. */
export interface AuthorizationUserRolesInput {
  roles: string[]
}

declare module 'nitropack' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges the authorization keys into route rules
  interface NitroRouteConfig extends AuthorizationRouteRules {}
}

declare module 'nitropack/types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges the authorization keys into route rules
  interface NitroRouteConfig extends AuthorizationRouteRules {}
}

declare module '#app' {
  interface PageMeta {
    /** A permission, a rule (`{ permission, authenticated, guest }`) or `false` to open the page. */
    authorize?: AuthorizeMeta
  }
}
