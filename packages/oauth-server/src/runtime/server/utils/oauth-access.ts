import type { H3Event } from 'h3'
import type {
  ApplicationAccessContext,
  ClaimsContext,
  OAuthApplication,
  OAuthUser,
  TokenType,
  UserRolesContext,
} from '../../../types'
import { matchesAllowedRoles } from '../../utils'

/**
 * Gate for the admin routes. The host decides through the `oauth:authorize` Nitro hook. Denied by default:
 *
 *     nitroApp.hooks.hook('oauth:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
 */
const adminGate = definePolicyGate('oauth:authorize')

export async function requireOAuthAdmin(event: H3Event): Promise<{ userId: number }> {
  const userId = await requireSessionUserId(event)
  await adminGate.assert(event, userId, 'You are not allowed to manage OAuth applications.')
  return { userId }
}

/** The user's roles as reported by the `oauth:user:roles` hook listeners (none without a listener). */
export async function resolveUserRoles(userId: number, event?: H3Event): Promise<string[]> {
  const ctx: UserRolesContext = { event, userId, roles: [] }
  await useNitroApp().hooks.callHook('oauth:user:roles', ctx)
  return [...new Set(ctx.roles)]
}

/** The stored user without the password hash; includes columns the host added to `users`. */
export async function getOAuthUser(userId: number): Promise<OAuthUser | null> {
  const row = await useAuthUserStore().findById(userId)
  if (!row) return null
  const { password: _password, ...user } = row
  return user as OAuthUser
}

export type ApplicationAccess = { allowed: boolean, reason?: string, roles: string[] }

/** Active, role allowed and not vetoed through `oauth:application:access`. */
export async function checkApplicationAccess(user: OAuthUser, application: OAuthApplication, event?: H3Event): Promise<ApplicationAccess> {
  const roles = await resolveUserRoles(user.id, event)
  if (!application.isActive) return { allowed: false, reason: 'This application is disabled.', roles }
  if (!matchesAllowedRoles(application.allowedRoles, roles)) {
    return { allowed: false, reason: 'You do not have permission to access this application.', roles }
  }
  const ctx: ApplicationAccessContext = { event, user, application, roles, allowed: true }
  await useNitroApp().hooks.callHook('oauth:application:access', ctx)
  return ctx.allowed ? { allowed: true, roles } : { allowed: false, reason: ctx.reason || 'Access to this application was denied.', roles }
}

export async function userCanAccessApplication(userId: number, application: OAuthApplication, event?: H3Event): Promise<boolean> {
  const user = await getOAuthUser(userId)
  return user ? (await checkApplicationAccess(user, application, event)).allowed : false
}

const RESERVED_CLAIMS = ['iss', 'sub', 'aud', 'exp', 'iat', 'nbf', 'jti', 'nonce', 'auth_time', 'scope', 'client_id']

/**
 * Builds the claims for a token: standard profile claims by scope, then the `oauth:claims` hook so the
 * host can add or change anything. Registered claims are re-applied by the signer afterwards.
 */
export async function buildClaims(input: {
  user: OAuthUser
  application: OAuthApplication
  scope: string[]
  roles: string[]
  tokenType: TokenType
}): Promise<Record<string, unknown>> {
  const claims: Record<string, unknown> = {}
  // Access tokens stay bare: identity claims belong in the ID token and userinfo.
  if (input.tokenType !== 'access_token') {
    if (input.scope.includes('profile')) {
      claims.name = input.user.name
      if (input.user.avatar) claims.picture = input.user.avatar
    }
    if (input.scope.includes('email')) claims.email = input.user.email
  }
  const ctx: ClaimsContext = { ...input, claims }
  await useNitroApp().hooks.callHook('oauth:claims', ctx)
  return Object.fromEntries(Object.entries(ctx.claims).filter(([name]) => !RESERVED_CLAIMS.includes(name)))
}
