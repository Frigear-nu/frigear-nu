import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack'
import { apiError, forbidden } from '@frigear-nu/module-kit/server'
import { registry } from '#auth/permissions'
import type { AuthPrincipal, AuthUser } from '../../types'
import { hasScopes } from '../../utils/scopes'
import { holds } from '../../utils/permissions'
import { requireAuth, getAuth } from './auth'
import { authAccessError, getUserGrants, inspect, subjectAllowed, userCan, canGrantScope } from './access'

// TEMPORARY adapters of the old guard API on top of the permission engine, so modules not yet migrated keep working.
// @deprecated — removed in phase 2. Use `authorize` / `allows` / `userCan`, `definePolicy` and `authorization:before`.

const isRegistered = (permission: string) => Object.hasOwn(registry.permissions, permission)

/**
 * The deprecated `requireAuth(event, { scopes })` check: each registered scope is authorized like `authorize` (the
 * codes stay as before: a denial is `insufficient_scope`); an unregistered one only by the credential's scopes.
 * @deprecated — removed in phase 2.
 */
export async function requireLegacyScopes(event: H3Event, principal: AuthPrincipal, scopes: readonly string[]): Promise<void> {
  const missing: string[] = []
  for (const scope of scopes) {
    if (isRegistered(scope)) {
      const decision = await inspect(event, scope)
      if (decision.allowed) continue
      if (decision.code === 'session_required') throw authAccessError(event, decision, scope)
      missing.push(scope)
    }
    else if (!hasScopes(principal.scopes, [scope]) || principal.permissions) {
      missing.push(scope)
    }
  }
  if (!missing.length) return
  setResponseHeader(event, 'www-authenticate', `Bearer error="insufficient_scope", scope="${scopes.join(' ')}"`)
  throw apiError(403, 'insufficient_scope', 'Forbidden', { error: 'insufficient_scope', scopes: [...scopes] })
}

async function subjectOf(event: H3Event, userId: number): Promise<AuthUser | null> {
  const principal = await getAuth(event)
  if (principal && String(principal.user.id) === String(userId)) return principal.user
  return loadAuthUser(userId)
}

/** @deprecated — removed in phase 2. */
export interface PolicyContext {
  event: H3Event
  userId: number
  allowed: boolean
}

/** @deprecated — removed in phase 2. */
export interface PolicyGateOptions {
  permission?: string
}

/**
 * A staff gate: starts from whether the user holds `permission` (roles and `authorization:before`, as their own
 * session), then fires the module's named hook, whose listeners may flip `ctx.allowed`. Only `true` allows.
 * @deprecated — removed in phase 2. Use `authorize` and an `authorization:before` listener.
 */
export function definePolicyGate<E extends object = Record<never, never>>(hook: string, options: PolicyGateOptions = {}) {
  const isAllowed = async (event: H3Event, userId: number, extra?: E) => {
    let allowed = false
    if (options.permission && isRegistered(options.permission)) {
      const user = await subjectOf(event, userId)
      allowed = !!user && await subjectAllowed(event, user, options.permission)
    }
    const ctx = { ...extra, event, userId, allowed } as PolicyContext & E
    await useNitroApp().hooks.callHook(hook as never, ctx as never)
    return ctx.allowed === true
  }

  return {
    isAllowed,
    async assert(event: H3Event, userId: number, message = 'You are not allowed to do that.', extra?: E) {
      if (!(await isAllowed(event, userId, extra))) throw forbidden(message)
    },
  }
}

/** @deprecated — removed in phase 2. */
export interface StaffGuardOptions {
  hook: string
  scope: string
  message?: string
}

/**
 * A module's staff check: authentication, a bearer credential must carry `scope`, then the policy gate.
 * @deprecated — removed in phase 2. Use `authorize(event, permission)`.
 */
export function defineStaffGuard(options: StaffGuardOptions) {
  const gate = definePolicyGate(options.hook, { permission: options.scope })
  return {
    async require(event: H3Event, requireOptions: { sessionOnly?: boolean } = {}): Promise<{ userId: number, principal: AuthPrincipal }> {
      const principal = await requireAuth(event, { sessionOnly: requireOptions.sessionOnly })
      if (principal.kind !== 'session') {
        const covered = principal.permissions
          ? isRegistered(options.scope) && holds(principal.permissions, options.scope, registry)
          : hasScopes(principal.scopes, [options.scope])
        if (!covered) {
          setResponseHeader(event, 'www-authenticate', `Bearer error="insufficient_scope", scope="${options.scope}"`)
          throw apiError(403, 'insufficient_scope', 'Forbidden', { error: 'insufficient_scope', scopes: [options.scope] })
        }
      }
      const userId = principal.user.id as number
      await gate.assert(event, userId, options.message)
      return { userId, principal }
    },
    can: (event: H3Event, userId: number) => gate.isAllowed(event, userId),
  }
}

/**
 * Lets the users a staff policy allows hold (and so delegate) `scopes`, through an `authorization:before` listener.
 * @deprecated — removed in phase 2. Grant the permissions through roles, or allow them in `authorization:before`.
 */
export function defineStaffScopes(scopes: string[], isAllowed: (event: H3Event, userId: number) => Promise<boolean>) {
  return defineNitroPlugin((nitro: NitroApp) => {
    nitro.hooks.hook('authorization:before', async (ctx) => {
      if (!scopes.includes(ctx.permission)) return
      // The policy may check the same permission again (through its gate): that inner check gets no vote from here.
      const guard = (ctx.event.context.authLegacyStaff ??= new Set<string>())
      const key = `${String(ctx.user.id)}|${ctx.permission}`
      if (guard.has(key)) return
      guard.add(key)
      try {
        if (await isAllowed(ctx.event, ctx.user.id as number)) ctx.allow()
      }
      finally {
        guard.delete(key)
      }
    })
  })
}

declare module 'h3' {
  interface H3EventContext {
    /** Staff scope checks in progress (`defineStaffScopes`). */
    authLegacyStaff?: Set<string>
  }
}

/**
 * Whether `user` holds `permission` (roles and `authorization:before`, no policies). Unregistered: `false`.
 * @deprecated — removed in phase 2. Use `userCan` (another user) or `allows` (the caller).
 */
export async function authUserCan(event: H3Event, user: { id: number } | number, permission: string): Promise<boolean> {
  return userCan(event, typeof user === 'number' ? user : user.id, permission)
}

/**
 * The grants `user`'s roles hold (wildcards included) plus `implicit` permissions. Never `null` any more.
 * @deprecated — removed in phase 2. Use `getEffectiveRoles` / `getUserPermissions`.
 */
export async function getAuthUserPermissions(event: H3Event, user: { id: number } | number): Promise<string[]> {
  const id = typeof user === 'number' ? user : user.id
  const subject = await subjectOf(event, id)
  return subject ? getUserGrants(event, subject) : []
}

/**
 * The registered permissions the caller may give a token, as the old scope shape.
 * @deprecated — removed in phase 2. Use `canGrantScope`.
 */
export async function availableScopes(event: H3Event, user: { id: number }) {
  const subject = await subjectOf(event, user.id)
  if (!subject) return []
  const result: Array<{ name: string, description?: string, sessionOnly?: boolean }> = []
  for (const definition of Object.values(registry.permissions)) {
    if (definition.sessionOnly) continue
    if (await canGrantScope(event, definition.name, { user: subject })) result.push({ name: definition.name, description: definition.description })
  }
  return result
}
