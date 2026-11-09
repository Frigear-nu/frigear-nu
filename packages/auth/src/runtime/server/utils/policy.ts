import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack'
import { apiError, forbidden } from '@frigear-nu/module-kit/server'
import type { AuthPrincipal } from '../../types'
import { hasScope, hasScopes } from '../../utils/scopes'
import { requireAuth } from './auth'

export interface PolicyContext {
  event: H3Event
  /** The signed-in user the decision is about. */
  userId: number
  /**
   * Starts as the role's decision (whether the user holds the gate's permission), else `false`; a hook listener may
   * set it either way.
   */
  allowed: boolean
}

export interface PolicyGateOptions {
  /**
   * The permission that decides by default (role-based access control): the hook context starts with `allowed` set to
   * whether the user holds it (`auth:user-permissions`). Without access control, or without a permission, it starts
   * `false`.
   */
  permission?: string
}

/**
 * A staff gate: the user's role decides (`permission`), and a Nitro hook lets the host add conditions on top. A module
 * defines one per area so it does not know who is staff:
 *
 *     const gate = definePolicyGate('events:authorize', { permission: 'events:manage' })
 *     // Only for rules a role cannot express (attribute-based: "only their own event", an email allowlist):
 *     nitroApp.hooks.hook('events:authorize', (ctx) => { ctx.allowed ||= isOnAllowlist(ctx.userId) })
 *
 * Without a permission, or without access control installed, the gate is denied until a listener allows it.
 *
 * `extra` is merged into the context the hook receives (e.g. `{ action, target, input }`), so a module can give
 * the host what it needs to decide; it cannot override `event`, `userId` or `allowed`.
 *
 * Only `ctx.allowed === true` allows: a listener that sets a truthy non-boolean (`1`, `'yes'`) is denied, so a
 * sloppy listener fails closed.
 *
 * The host identifies the caller from `ctx.userId`, never from the session on `ctx.event`: it is empty for bearer
 * requests.
 */
export function definePolicyGate<E extends object = Record<never, never>>(hook: string, options: PolicyGateOptions = {}) {
  const isAllowed = async (event: H3Event, userId: number, extra?: E) => {
    const permissions = options.permission ? await getAuthUserPermissions(event, userId) : null
    const allowed = !!permissions && hasScope(permissions, options.permission!)
    const ctx = { ...extra, event, userId, allowed } as PolicyContext & E
    await useNitroApp().hooks.callHook(hook as never, ctx as never)
    return ctx.allowed === true
  }

  return {
    isAllowed,
    /** Throws 403 `forbidden` unless the host allows `userId`. */
    async assert(event: H3Event, userId: number, message = 'You are not allowed to do that.', extra?: E) {
      if (!(await isAllowed(event, userId, extra))) throw forbidden(message)
    },
  }
}

export interface StaffGuardOptions {
  /** The Nitro hook the host answers (`<module>:authorize`), as for `definePolicyGate`. */
  hook: string
  /**
   * The permission the guard checks (`events:manage`): a session's role must hold it, a bearer credential must carry it
   * as a scope. It also decides the host hook's default (`definePolicyGate`'s `permission`).
   */
  scope: string
  /** The 403 message when the host denies the caller. */
  message?: string
}

/**
 * A module's staff check in one object: authentication with the module's staff permission, then the policy gate (the
 * user's role, plus any host conditions).
 *
 *     export const eventsStaff = defineStaffGuard({ hook: 'events:authorize', scope: 'events:admin', message: 'You cannot manage events.' })
 *     const { userId } = await eventsStaff.require(event)                       // reads and ordinary edits
 *     const { userId } = await eventsStaff.require(event, { sessionOnly: true }) // credentials, money, billing
 *     if (await eventsStaff.can(event, userId)) { ... }                          // MCP tools, menus
 *
 * `require` returns the principal, not the full stored user (auth does not depend on `@frigear-nu/users`): a route
 * that needs the user's other columns loads them with `loadAuthUser(userId)`.
 */
export function defineStaffGuard(options: StaffGuardOptions) {
  const gate = definePolicyGate(options.hook, { permission: options.scope })
  return {
    /**
     * Throws 401 without a credential, 403 when a bearer credential lacks the scope (or is used with `sessionOnly`),
     * 403 when the gate denies (neither the role nor a host condition lets the user in).
     */
    async require(event: H3Event, requireOptions: { sessionOnly?: boolean } = {}): Promise<{ userId: number, principal: AuthPrincipal }> {
      const principal = await requireAuth(event, { sessionOnly: requireOptions.sessionOnly })
      // A bearer credential must carry the scope it was delegated. A session is not checked for it here: the gate
      // decides (the role holds the permission, or a host condition such as an email allowlist lets the user in).
      if (principal.kind !== 'session' && !hasScopes(principal.scopes, [options.scope])) {
        setResponseHeader(event, 'www-authenticate', `Bearer error="insufficient_scope", scope="${options.scope}"`)
        throw apiError(403, 'insufficient_scope', 'Forbidden', { error: 'insufficient_scope', scopes: [options.scope] })
      }
      const userId = principal.user.id
      await gate.assert(event, userId, options.message)
      return { userId, principal }
    },
    /** Whether the gate lets `userId` in (never throws on denial). */
    can: (event: H3Event, userId: number) => gate.isAllowed(event, userId),
  }
}

/**
 * A Nitro plugin that only offers staff scopes to the users a policy lets in (`auth:scope-available`), so the token UI
 * does not list scopes whose tools the user could never use. With role-based access control
 * (`@frigear-nu/authorization`) scopes a user does not hold are hidden already; this then only adds host conditions.
 */
export function defineStaffScopes(scopes: string[], isAllowed: (event: H3Event, userId: number) => Promise<boolean>) {
  return defineNitroPlugin((nitro: NitroApp) => {
    nitro.hooks.hook('auth:scope-available', async (ctx) => {
      if (!scopes.includes(ctx.scope.name)) return
      ctx.available = await isAllowed(ctx.event, ctx.user.id)
    })
  })
}
