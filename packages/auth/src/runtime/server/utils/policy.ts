import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack'
import { forbidden } from '@frigear-nu/module-kit/server'
import type { AuthPrincipal } from '../../types'
import { requireAuth } from './auth'

export interface PolicyContext {
  event: H3Event
  /** The signed-in user the decision is about. */
  userId: number
  /** Starts `false`; a hook listener sets it to `true` to allow. */
  allowed: boolean
}

/**
 * A staff gate decided by the host through a Nitro hook, denied by default. A module defines one per area so it
 * does not know who is staff:
 *
 *     const gate = definePolicyGate('events:authorize')
 *     nitroApp.hooks.hook('events:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
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
export function definePolicyGate<E extends object = Record<never, never>>(hook: string) {
  const isAllowed = async (event: H3Event, userId: number, extra?: E) => {
    const ctx = { ...extra, event, userId, allowed: false } as PolicyContext & E
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
  /** The scope a bearer credential needs (`events:admin`). Sessions carry every scope. */
  scope: string
  /** The 403 message when the host denies the caller. */
  message?: string
}

/**
 * A module's staff check in one object: authentication with the module's staff scope, then the host's policy gate.
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
  const gate = definePolicyGate(options.hook)
  return {
    /** Throws 401 without a credential, 403 without the scope (or a session when `sessionOnly`), 403 when the host denies. */
    async require(event: H3Event, requireOptions: { sessionOnly?: boolean } = {}): Promise<{ userId: number, principal: AuthPrincipal }> {
      const principal = await requireAuth(event, { scopes: [options.scope], sessionOnly: requireOptions.sessionOnly })
      const userId = principal.user.id
      await gate.assert(event, userId, options.message)
      return { userId, principal }
    },
    /** Whether the host lets `userId` in (never throws on denial). */
    can: (event: H3Event, userId: number) => gate.isAllowed(event, userId),
  }
}

/**
 * A Nitro plugin that only offers staff scopes to the users a policy lets in (`auth:scope-available`), so the token UI
 * does not list scopes whose tools the user could never use.
 */
export function defineStaffScopes(scopes: string[], isAllowed: (event: H3Event, userId: number) => Promise<boolean>) {
  return defineNitroPlugin((nitro: NitroApp) => {
    nitro.hooks.hook('auth:scope-available', async (ctx) => {
      if (!scopes.includes(ctx.scope.name)) return
      ctx.available = await isAllowed(ctx.event, ctx.user.id)
    })
  })
}
