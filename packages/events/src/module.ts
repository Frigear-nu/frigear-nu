import {
  addComponentsDir,
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  defineModulePage,
  registerDatabaseTable,
  registerModule,
} from '@frigear-nu/module-kit/utils'
import type {
  AuthorizeContext,
  EventsRuntimeConfig,
  ModuleOptions,
  PublicModuleOptions,
  PurchaseBeforeContext,
  TicketHookContext,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    events?: ModuleOptions
  }

  interface RuntimeConfig {
    events: EventsRuntimeConfig
  }

  interface PublicRuntimeConfig {
    events: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Staff gate (event management, check-in): set `ctx.allowed = true` to let the user in. Denied by default. */
    'events:authorize': (ctx: AuthorizeContext) => void | Promise<void>
    /** Policy hook: throw to deny a purchase. */
    'events:purchase:before': (ctx: PurchaseBeforeContext) => void | Promise<void>
    /** A ticket became `paid` (free tickets immediately, paid ones after the Stripe event). Send confirmations here. */
    'events:ticket:paid': (ctx: TicketHookContext) => void | Promise<void>
    /** A paid ticket was fully refunded. */
    'events:ticket:refunded': (ctx: TicketHookContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/events'

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'events' },
  defaults: {
    settings: { pages: {}, reservationMinutes: 30 },
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
      defaults: { kv: true },
    },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/stripe': { version: '>=0.0.1' },
    '@frigear-nu/payments': { version: '>=0.0.1' },
    '@frigear-nu/subscriptions': { version: '>=0.0.1', optional: true },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    const settings = options.settings ?? {}
    const withMenus = hasNuxtModule('@frigear-nu/menu')
    const withMembership = hasNuxtModule('@frigear-nu/subscriptions')

    const eventsPath = resolvePagePath(settings.pages?.events, '/events')
    const eventPath = resolvePagePath(settings.pages?.event, '/events/:slug')
    const ticketsPath = resolvePagePath(settings.pages?.tickets, '/account/tickets')

    nuxt.options.runtimeConfig.events = {
      reservationMinutes: settings.reservationMinutes ?? 30,
      membershipEnabled: withMembership,
    }
    nuxt.options.runtimeConfig.public.events = {
      pages: { events: eventsPath, event: eventPath, tickets: ticketsPath },
    }

    // --- Database -------------------------------------------------------------------------
    await registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- Membership requirements ----------------------------------------------------------
    // @frigear-nu/subscriptions is optional. A virtual module either re-exports its entitlement
    // check or a stub that denies, so a requirement can never be silently ignored.
    addServerTemplate({
      filename: '#events/membership',
      getContents: () => withMembership
        ? `export { hasActiveSubscription } from '@frigear-nu/subscriptions/utils'`
        : `export const hasActiveSubscription = async () => false`,
    })
    addTypeTemplate({
      filename: 'types/events-membership.d.ts',
      getContents: () => `declare module '#events/membership' {
  export function hasActiveSubscription(userId: number, options?: { plans?: string[], statuses?: string[] }): Promise<boolean>
}
`,
    })

    // --- API routes -----------------------------------------------------------------------
    const route = (method: 'get' | 'post' | 'patch' | 'delete', path: string, file: string) =>
      addServerHandler({ route: `/api/events${path}`, method, handler: resolver.resolve(`./runtime/server/routes/${file}`) })

    route('get', '', 'public/events.get')
    // Static `tickets/*` and `check-in` segments win over `:slug` in the router.
    route('get', '/tickets/me', 'public/tickets-me.get')
    route('get', '/tickets/:id', 'public/ticket.get')
    route('post', '/tickets/:id/pay', 'public/ticket-pay.post')
    route('post', '/check-in', 'public/check-in.post')
    route('get', '/:slug', 'public/event.get')
    route('post', '/:slug/purchase', 'public/purchase.post')

    route('get', '/admin/events', 'admin/events.get')
    route('post', '/admin/events', 'admin/events.post')
    route('patch', '/admin/events/:id', 'admin/event.patch')
    route('delete', '/admin/events/:id', 'admin/event.delete')
    route('get', '/admin/events/:id/tickets', 'admin/attendees.get')
    route('post', '/admin/events/:id/ticket-types', 'admin/ticket-types.post')
    route('patch', '/admin/ticket-types/:id', 'admin/ticket-type.patch')
    route('delete', '/admin/ticket-types/:id', 'admin/ticket-type.delete')
    route('post', '/admin/ticket-types/:id/addon-groups', 'admin/addon-groups.post')
    route('patch', '/admin/addon-groups/:id', 'admin/addon-group.patch')
    route('delete', '/admin/addon-groups/:id', 'admin/addon-group.delete')
    route('post', '/admin/addon-groups/:id/addons', 'admin/addons.post')
    route('patch', '/admin/addons/:id', 'admin/addon.patch')
    route('delete', '/admin/addons/:id', 'admin/addon.delete')
    route('post', '/admin/tickets/:id/cancel', 'admin/ticket-cancel.post')
    route('post', '/admin/tickets/:id/refund', 'admin/ticket-refund.post')

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/payment-hooks'))

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useEvents', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useEvent', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useMyTickets', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useEventsLocale', from: resolver.resolve('./runtime/app/composables/useEvents') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    // Pages are opt-in (they require `@nuxt/ui` in the consuming app).
    if (eventsPath || eventPath || ticketsPath) {
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))
        if (eventsPath && !existingPaths.has(eventsPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-list', path: eventsPath, file: resolver.resolve('./runtime/app/pages/events.vue') }))
        }
        if (eventPath && !existingPaths.has(eventPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-detail', path: eventPath, file: resolver.resolve('./runtime/app/pages/event.vue') }))
        }
        if (ticketsPath && !existingPaths.has(ticketsPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-tickets', path: ticketsPath, file: resolver.resolve('./runtime/app/pages/tickets.vue') }))
        }
      })
    }

    if (withMenus) {
      const { registerMenuSource } = await import('@frigear-nu/menu/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })
    }
  },
})
