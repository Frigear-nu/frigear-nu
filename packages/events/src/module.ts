import {
  addComponentsDir,
  addImports,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  registerDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  registerBootstrapProvider,
  addModuleRoutes,
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
    // Provides the admin route and shell the admin pages live in; the page components come from `@frigear-nu/ui`.
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

    const eventsPath = resolvePagePath(settings.pages?.events, '/events')
    const eventPath = resolvePagePath(settings.pages?.event, '/events/:slug')
    const ticketsPath = resolvePagePath(settings.pages?.tickets, '/account/tickets')
    // The admin pages live in the shell of `@frigear-nu/admin`, so they only exist with it.
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
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    // Static segments (`me`, and `/api/admin/events/{upcoming,membership-options,check-in,ticket-types,...}`) win over
    // `:slug` / `:id` in h3's radix router, whatever the registration order.
    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'public/events.get' },
      { method: 'get', path: 'me/tickets', file: 'me/tickets.get' },
      { method: 'get', path: 'me/tickets/:id', file: 'me/ticket.get' },
      { method: 'post', path: 'me/tickets/:id/pay', file: 'me/ticket-pay.post' },
      { method: 'get', path: ':slug', file: 'public/event.get' },
      { method: 'post', path: ':slug/purchase', file: 'public/purchase.post' },
    ], { base: '/api/events' })
    // The account area loads the caller's tickets together with the other modules' data (`useMyTickets()` reads the
    // same key); the handler is shared with `GET /api/events/me/tickets`.
    registerBootstrapProvider(nuxt, {
      scope: 'account',
      key: 'events:tickets:mine',
      handler: resolver.resolve('./runtime/server/bootstrap/my-tickets'),
    })

    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'admin/events.get' },
      { method: 'post', path: '', file: 'admin/events.post' },
      { method: 'get', path: 'membership-options', file: 'admin/membership-options.get' },
      { method: 'get', path: 'upcoming', file: 'admin/upcoming.get' },
      { method: 'post', path: 'check-in', file: 'admin/check-in.post' },
      { method: 'get', path: ':id', file: 'admin/event.get' },
      { method: 'patch', path: ':id', file: 'admin/event.patch' },
      { method: 'delete', path: ':id', file: 'admin/event.delete' },
      { method: 'post', path: ':id/clone', file: 'admin/event-clone.post' },
      { method: 'get', path: ':id/tickets', file: 'admin/attendees.get' },
      { method: 'post', path: ':id/ticket-types', file: 'admin/ticket-types.post' },
      { method: 'patch', path: 'ticket-types/:id', file: 'admin/ticket-type.patch' },
      { method: 'delete', path: 'ticket-types/:id', file: 'admin/ticket-type.delete' },
      { method: 'post', path: 'ticket-types/:id/addon-groups', file: 'admin/addon-groups.post' },
      { method: 'patch', path: 'addon-groups/:id', file: 'admin/addon-group.patch' },
      { method: 'delete', path: 'addon-groups/:id', file: 'admin/addon-group.delete' },
      { method: 'post', path: 'addon-groups/:id/addons', file: 'admin/addons.post' },
      { method: 'patch', path: 'addons/:id', file: 'admin/addon.patch' },
      { method: 'delete', path: 'addons/:id', file: 'admin/addon.delete' },
      { method: 'post', path: 'tickets/:id/cancel', file: 'admin/ticket-cancel.post' },
      { method: 'post', path: 'tickets/:id/refund', file: 'admin/ticket-refund.post' },
    ], { base: '/api/admin/events' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
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
      { name: 'useEventLinks', from: resolver.resolve('./runtime/app/composables/useEventLinks') },
      { name: 'useEventActions', from: resolver.resolve('./runtime/app/composables/useEventActions') },
      { name: 'useEventCatalogActions', from: resolver.resolve('./runtime/app/composables/useEventCatalogActions') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    // Pages are opt-in (they require `@nuxt/ui` in the consuming app).
    addModulePages(MODULE_NAME, resolver, [
      { name: 'events-list', path: eventsPath, file: './runtime/app/pages/events.vue' },
      { name: 'events-detail', path: eventPath, file: './runtime/app/pages/event.vue' },
      { name: 'events-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'events-admin-event', path: adminEventPath, file: './runtime/app/pages/admin-event.vue' },
      { name: 'events-tickets', path: ticketsPath, file: './runtime/app/pages/tickets.vue' },
    ])

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

    // Upcoming events as a stat card and a list on the admin dashboard (`admin.dashboard.*` areas of `@frigear-nu/admin`).
    if (adminPath && hasNuxtModule('@frigear-nu/widget')) {
      const { extendWidgets } = await import('@frigear-nu/widget/utils')
      extendWidgets(nuxt, 'admin.dashboard.top', { id: 'events-upcoming-stat', component: resolver.resolve('./runtime/app/widgets/UpcomingEventsStat.vue'), order: 20 })
      extendWidgets(nuxt, 'admin.dashboard.side', { id: 'events-upcoming', component: resolver.resolve('./runtime/app/widgets/UpcomingEvents.vue'), order: 10 })
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })
  },
})
