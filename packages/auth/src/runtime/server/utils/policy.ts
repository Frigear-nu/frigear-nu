import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack'

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
 * The host identifies the caller from `ctx.userId`, never from the session on `ctx.event`: it is empty for bearer
 * requests.
 */
export function definePolicyGate(hook: string) {
  const isAllowed = async (event: H3Event, userId: number) => {
    const ctx: PolicyContext = { event, userId, allowed: false }
    await useNitroApp().hooks.callHook(hook as never, ctx as never)
    return ctx.allowed
  }

  return {
    isAllowed,
    /** Throws 403 unless the host allows `userId`. */
    async assert(event: H3Event, userId: number, message = 'You are not allowed to do that.') {
      if (!(await isAllowed(event, userId))) throw createError({ statusCode: 403, statusMessage: message })
    },
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
