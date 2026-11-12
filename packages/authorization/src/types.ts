import type { AuthorizeMeta, RouteRule } from './runtime/utils/types'
import type { RbacConfig, RbacGrant, RbacRoleSource } from './runtime/utils/rbac'

export type { Ability, AbilityArgs, AuthorizeMeta, RouteRule, AuthorizationResponse } from './runtime/utils/types'
export type { RbacConfig, RbacGrant, RbacRole, RbacRoleInput, RbacRoleSource, RbacTable } from './runtime/utils/rbac'

export interface ModuleOptions {
  /**
   * Path to the file whose exports are the app's abilities (`defineAbility(...)`). Required to refer to
   * abilities by name in `routes`/`definePageMeta`. Defaults to `shared/utils/abilities.ts` (auto-imported in app and server) or `shared/abilities.ts`.
   */
  abilities?: string
  /** Override how the user is resolved (paths to default-export functions). Defaults to the session user. */
  resolvers?: {
    /** `(event: H3Event) => User | null | Promise<User | null>` */
    server?: string
    /** `() => User | null | Promise<User | null>` - runs in the app (client and SSR). */
    client?: string
  }
  /**
   * Where to send unauthenticated visitors on page navigation. Defaults to Auth's login path in client mode; omit it in
   * server mode, or set `false` in client mode, to show a 401 error instead.
   */
  redirectTo?: string | false
  /**
   * Role-based access control: roles hold permissions (the scopes modules register), senior roles inherit their
   * juniors', and every credential acts within its user's role. Sessions then hold their role's permissions instead
   * of everything, staff checks follow the role, and users only see the scopes they hold. Built-in roles: `admin`
   * (everything) above `user`; modules add theirs. Defaults to `false` for now (it will become the default).
   */
  rbac?: boolean
  /** Shapes the roles (with `rbac`): hierarchy, extra grants, revokes, labels, the default role. */
  roles?: RbacConfig
}

/** `GET /api/authorization/me/permissions`. */
export interface AuthorizationPermissionsDto {
  /** `null` without `rbac`. */
  role: { name: string, label: string } | null
  /** Scope names and `resource:*` wildcards; `['*']` without `rbac`. */
  permissions: string[]
}

/** The role → permission table the app sees (`rbac` on), most senior role first. */
export interface PublicRbacTable {
  defaultRole: string
  roles: { name: string, label: string, permissions: string[] }[]
}

/**
 * Authorization keys that go directly on a `routeRules` entry. Ability names refer to exports of the abilities
 * file and take no arguments.
 */
export type AuthorizationRouteRules = Omit<RouteRule, 'args' | 'ability'> & { ability?: string }

export interface PublicModuleOptions {
  /** The authorization keys of `routeRules`, collected at build time. */
  routes?: Record<string, AuthorizationRouteRules>
  /** Auth's anonymous entry points (`public.authentication.publicPaths`): less specific guards stop there. */
  exempt?: string[]
  redirectTo?: string
  /** Set with `rbac`: what each role may do, for `can()` and `<Can permission>`. */
  rbac?: PublicRbacTable
  /** The admin pages (`rbac` with `@frigear-nu/admin`). */
  pages?: { roles?: string }
}

/** One role of `GET /api/admin/authorization/roles`, most senior first. */
export interface AuthorizationRoleSummaryDto {
  name: string
  label: string
  description: string | null
  source: RbacRoleSource
  /** Direct juniors: the roles whose permissions this one inherits. */
  inherits: string[]
  /** Position in the hierarchy, 0 is the most senior. */
  rank: number
  /** Whether users with an unknown stored role act as this one. */
  isDefault: boolean
  /** Users whose stored role is this one. */
  userCount: number
  /** Registered permissions the role holds (directly, inherited or through a wildcard). */
  permissionCount: number
}

/** A permission as one role sees it. */
export interface AuthorizationRolePermissionDto {
  /** A registered scope, or a wildcard (`*`, `resource:*`) the role holds. */
  name: string
  description: string | null
  /** Personal data (`:pii`): never covered by a wildcard. */
  pii: boolean
  /** The part before the first `:` (`*` for the full wildcard). */
  resource: string
  wildcard: boolean
  /** Why the role holds it; `null` when it does not. */
  grant: RbacGrant | null
}

/** `GET /api/admin/authorization/roles/:name`. */
export interface AuthorizationRoleDto extends AuthorizationRoleSummaryDto {
  /** Every registered permission (held or not), then the wildcards the role holds. */
  permissions: AuthorizationRolePermissionDto[]
}

/** One row of `GET /api/admin/authorization/roles/:name/users`. */
export interface AuthorizationRoleUserDto {
  id: number
  name: string
  email: string
}

/** `GET /api/admin/authorization/roles/:name/users`. */
export interface AuthorizationRoleUsersPageDto {
  items: AuthorizationRoleUserDto[]
  total: number
  page: number
  pageSize: number
}

/** `GET /api/admin/authorization/permissions`: every registered permission against every role. */
export interface AuthorizationPermissionMatrixDto {
  roles: { name: string, label: string }[]
  permissions: {
    name: string
    description: string | null
    pii: boolean
    resource: string
    /** Per role name: why it holds the permission, or `null`. */
    holders: Record<string, RbacGrant | null>
  }[]
}

/** The `authorization:authorize` Nitro hook: the staff gate of the roles admin (`roles:read`). */
export interface AuthorizationAuthorizeContext {
  event: import('h3').H3Event
  userId: number
  /** Starts as whether the user's role holds `roles:read`; set it to change the decision. */
  allowed: boolean
}

declare module 'nitropack' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges the authorization keys into route rules
  interface NitroRouteConfig extends AuthorizationRouteRules {}
}

/** The `authorization:role` Nitro hook: the role a user acts as. Change `ctx.role` (e.g. an email allowlist of admins). */
export interface AuthorizationRoleContext {
  event: import('h3').H3Event
  /** The user as stored. */
  user: { id: number, role?: string | null, email?: string, emailVerifiedAt?: Date | null, [key: string]: unknown }
  /** Starts as `user.role`; an unknown role acts as the default role. */
  role: string | null | undefined
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    'authorization:role': (ctx: AuthorizationRoleContext) => void | Promise<void>
    /** Staff gate of the roles admin: starts as whether the user holds `roles:read`. */
    'authorization:authorize': (ctx: AuthorizationAuthorizeContext) => void | Promise<void>
  }
}

declare module 'nitropack/types' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merges the authorization keys into route rules
  interface NitroRouteConfig extends AuthorizationRouteRules {}
}

declare module '#app' {
  interface PageMeta {
    authorize?: AuthorizeMeta
  }
}
