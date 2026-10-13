import {
  addComponentsDir,
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  defineModulePage,
  registerDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import { adminRoute } from '@frigear-nu/admin/utils'
import { addAuthScope } from '@frigear-nu/auth/utils'
import { addMcpDefinitions } from '@frigear-nu/mcp/utils'
import type {
  AuthorizeContext,
  EventsRuntimeConfig,
  MembershipCheckContext,
  MembershipOptionsContext,
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
    /**
     * Membership provider (e.g. `@frigear-nu/subscriptions`): set `ctx.satisfied = true` when the user holds a
     * membership matching `ctx.requirement`. With no provider a requirement can never be met, so it fails closed.
     */
    'events:membership:check': (ctx: MembershipCheckContext) => void | Promise<void>
    /** Membership provider: set `ctx.available = true` and add the selectable memberships to `ctx.options`. */
    'events:membership:options': (ctx: MembershipOptionsContext) => void | Promise<void>
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
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/mcp': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/stripe': { version: '>=0.0.1' },
    '@frigear-nu/payments': { version: '>=0.0.1' },
    '@frigear-nu/subscriptions': { version: '>=0.0.1', optional: true },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Provides the shared page components of the admin pages (`AdminPage`, `AdminTable`, ...).
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    addAuthScope(nuxt,
      { name: 'events:manage', description: 'Manage events, tickets and check-in (staff)' },
      { name: 'tickets:read', description: 'Read your tickets and event details' },
      { name: 'tickets:write', description: 'Buy tickets and pay for them' },
      { name: 'events:pii', description: 'See attendee names and emails through MCP tools (also needs events:manage)' },
    )
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}
    const withMenus = hasNuxtModule('@frigear-nu/menu')

    const eventsPath = resolvePagePath(settings.pages?.events, '/events')
    const eventPath = resolvePagePath(settings.pages?.event, '/events/:slug')
    const ticketsPath = resolvePagePath(settings.pages?.tickets, '/account/tickets')
    // The admin pages are built from the components of `@frigear-nu/admin`, so they only exist with it.
    const withAdmin = hasNuxtModule('@frigear-nu/admin')
    const adminPath = withAdmin ? resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'events')) : undefined
    const adminEventPath = withAdmin ? resolvePagePath(settings.pages?.adminEvent, adminRoute(nuxt, 'events', ':id')) : undefined

    nuxt.options.runtimeConfig.events = {
      reservationMinutes: settings.reservationMinutes ?? 30,
    }
    nuxt.options.runtimeConfig.public.events = {
      pages: { events: eventsPath, event: eventPath, tickets: ticketsPath, admin: adminPath, adminEvent: adminEventPath },
    }

    // --- Database -------------------------------------------------------------------------
    await registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
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

    route('get', '/admin/membership-options', 'admin/membership-options.get')
    route('get', '/admin/events', 'admin/events.get')
    route('get', '/admin/events/:id', 'admin/event.get')
    route('post', '/admin/events', 'admin/events.post')
    route('patch', '/admin/events/:id', 'admin/event.patch')
    route('delete', '/admin/events/:id', 'admin/event.delete')
    route('post', '/admin/events/:id/clone', 'admin/event-clone.post')
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
    if (settings.mcp === true) addMcpDefinitions(nuxt, resolver.resolve('./runtime/server/mcp'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/payment-hooks'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/staff-scopes'))

    // Subscription plans are the memberships when `@frigear-nu/subscriptions` is installed. Checked once every module
    // has registered, since it may come after this one in `modules`. Other providers hook `events:membership:*` themselves.
    nuxt.hook('modules:done', () => {
      if (hasNuxtModule('@frigear-nu/subscriptions', nuxt)) {
        addServerPlugin(resolver.resolve('./runtime/server/plugins/subscriptions-membership'))
      }
    })

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useEvents', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useEvent', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useMyTickets', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useEventsLocale', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useEventsFallbackLocale', from: resolver.resolve('./runtime/app/composables/useEvents') },
      { name: 'useEventsTranslate', from: resolver.resolve('./runtime/app/composables/useEvents') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    // Pages are opt-in (they require `@nuxt/ui` in the consuming app).
    if (eventsPath || eventPath || ticketsPath || adminPath || adminEventPath) {
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))
        if (eventsPath && !existingPaths.has(eventsPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-list', path: eventsPath, file: resolver.resolve('./runtime/app/pages/events.vue') }))
        }
        if (eventPath && !existingPaths.has(eventPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-detail', path: eventPath, file: resolver.resolve('./runtime/app/pages/event.vue') }))
        }
        if (adminPath && !existingPaths.has(adminPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-admin', path: adminPath, file: resolver.resolve('./runtime/app/pages/admin.vue') }))
        }
        if (adminEventPath && !existingPaths.has(adminEventPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-admin-event', path: adminEventPath, file: resolver.resolve('./runtime/app/pages/admin-event.vue') }))
        }
        if (ticketsPath && !existingPaths.has(ticketsPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'events-tickets', path: ticketsPath, file: resolver.resolve('./runtime/app/pages/tickets.vue') }))
        }
      })
    }

    // Owns the `admin.events` tab area of the admin event page (modules add tabs with
    // `extendTabs(nuxt, 'admin.events', ...)`) when @frigear-nu/widget is installed.
    if (adminEventPath && hasNuxtModule('@frigear-nu/widget')) {
      const { extendTabs } = await import('@frigear-nu/widget/utils')
      extendTabs(nuxt, 'admin.events', [
        { id: 'details', component: resolver.resolve('./runtime/app/tabs/Details.vue'), order: 0, label: 'Details', labelKey: 'events.admin.tabs.details', icon: 'i-lucide-file-text' },
        { id: 'tickets', component: resolver.resolve('./runtime/app/tabs/Tickets.vue'), order: 10, label: 'Tickets', labelKey: 'events.admin.tabs.tickets', icon: 'i-lucide-ticket' },
        { id: 'attendees', component: resolver.resolve('./runtime/app/tabs/Attendees.vue'), order: 20, label: 'Attendees', labelKey: 'events.admin.tabs.attendees', icon: 'i-lucide-users' },
      ])
    }

    if (withMenus) {
      const { registerMenuSource } = await import('@frigear-nu/menu/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })
    }
  },
})
