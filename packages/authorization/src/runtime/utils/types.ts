import type { Permission } from '@frigear-nu/auth/access'
import { authorizationAccess } from '../access'

/**
 * Declarative rule: the keys of a `routeRules` entry, or the object form of `definePageMeta({ authorize })`. Auth's
 * server middleware enforces them for `/api/**`; this module's page middleware enforces them for pages.
 */
export interface RouteRule {
  /** The permission (`resource:action`) the visitor must hold. Implies a signed-in visitor. */
  permission?: Permission
  /** Only for signed-out visitors (sign-in, register): a signed-in visitor gets 403, as auth's API middleware answers. */
  guest?: boolean
  /** `true`: require a signed-in visitor. `false`: no rule at all (opens a sub-route of a protected pattern). */
  authenticated?: boolean
}

/** The authorization keys that go directly on a `routeRules` entry. */
export const ROUTE_RULE_KEYS = ['permission', 'authenticated', 'guest'] as const

/** What `definePageMeta({ authorize })` accepts: a permission, a rule, or `false` to open the page whatever `routeRules` say. */
export type AuthorizeMeta = Permission | RouteRule | false

/** The outcome of a rule or a check: 401 for guests, 403 for a missing permission. */
export interface AuthorizationResponse {
  authorized: boolean
  statusCode?: 401 | 403
  message?: string
}

/** See the roles admin: the roles, what each may do and who has them. */
export const AUTHORIZATION_ROLES_READ = authorizationAccess.permissions['roles:read']
/** Assign and remove roles. Session only, and the caller must also hold every permission of the role. */
export const AUTHORIZATION_ROLES_ASSIGN = authorizationAccess.permissions['roles:assign']
