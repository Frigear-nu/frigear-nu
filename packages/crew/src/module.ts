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
  extendDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  addModuleRoutes,
  addPageRedirects,
  isPathUnder,
  resolveDashboardHubPath,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, guardPages, registerAccess } from '@frigear-nu/auth/utils'
import { crewAccess } from './runtime/access'
import { CREW_DEFAULT_PAGES, CREW_HOME_TAB, CREW_HOME_TABS, crewHomeTab, resolveCrewHomePath } from './runtime/utils/links'
import { extendDashboard } from '@frigear-nu/dashboard/utils'
import { CREW_DASHBOARD, crewDashboardItems } from './runtime/dashboard'
import { extendNotificationTopics } from '@frigear-nu/notify/utils'
import { crewNotificationTopics } from './runtime/notifications'
import type { CrewMemberContext, CrewRuntimeConfig, ModuleOptions, PublicModuleOptions } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    crew?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    crew: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Somebody applied to an operation's crew (or applied again after withdrawing). */
    'crew:member:applied': (ctx: CrewMemberContext) => void | Promise<void>
    /** Somebody joined the crew: approved by staff, promoted off the waiting list or through an invite. */
    'crew:member:approved': (ctx: CrewMemberContext) => void | Promise<void>
    /** An application was rejected, or an approved person was taken off the crew. */
    'crew:member:rejected': (ctx: CrewMemberContext) => void | Promise<void>
    /** Somebody is on the waiting list (over the capacity, or put there by staff). */
    'crew:member:waitlisted': (ctx: CrewMemberContext) => void | Promise<void>
    /** Somebody withdrew their application or their place. */
    'crew:member:withdrawn': (ctx: CrewMemberContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/crew'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'crew' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // The crew are users: the member list, the phone number and the emails read the `users` table.
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    // Crew memberships are teams memberships, and an operation owns the teams.
    '@frigear-nu/operations': { version: '>=0.0.0' },
    '@frigear-nu/teams': { version: '>=0.0.0' },
    // Applications are submissions of a forms form.
    '@frigear-nu/forms': { version: '>=0.0.1' },
    // The status message goes through notify's `notifyUser` (email and push, by the person's choice).
    '@frigear-nu/notify': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // The Crew tab of the operation page and the "Add to crew" action of an inbox thread (`inbox.thread.actions`).
    '@frigear-nu/widget': { version: '>=0.0.0' },
    // The `crew.home` dashboard: this module's items, and the crew home page that renders it.
    '@frigear-nu/dashboard': { version: '>=0.0.0' },
    // Provides the admin route and shell the operation page lives in.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    '@frigear-nu/mobile': { version: '>=0.0.0', optional: true },
    // Renders the `crew-status-*` emails from the templates this module ships.
    '@frigear-nu/email-templates': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // `crew:apply`, `crew:read`, `crew:manage`, `crew:pii`, `crew:invite` and the `crew` scope (`runtime/access.ts`).
    registerAccess(nuxt, crewAccess, { from: MODULE_NAME })
    // The record rule of `crew:read`: the person, the leads of their team, and staff.
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // The volunteer pages are on unless a page is `false`. With the signed-in hub of `@frigear-nu/dashboard` the home
    // page is the hub's Crew area (`/dashboard/crew`), and My crew is one of its tabs rather than a page of its own: the
    // old paths redirect there. The mobile tab bar keeps the pages (its tabs open them, and the dashboard's Home tab
    // owns `/crew`), so with `@frigear-nu/mobile` only the home page moves.
    const hub = resolveDashboardHubPath(nuxt, { dependency: true })
    const homePath = resolveCrewHomePath(settings.pages?.home, hub)
    const inDashboard = !!(hub && homePath && isPathUnder(homePath, hub))
    const tabsOnly = inDashboard && !hasNuxtModule('@frigear-nu/mobile')
    const statusSetting = settings.pages?.status ?? true
    const statusPath = tabsOnly && typeof statusSetting !== 'string' ? undefined : resolvePagePath(statusSetting, CREW_DEFAULT_PAGES.status)
    const applyPath = resolvePagePath(settings.pages?.apply ?? true, CREW_DEFAULT_PAGES.apply)
    const invitePath = resolvePagePath(settings.pages?.invite ?? true, CREW_DEFAULT_PAGES.invite)
    // How `@nuxtjs/i18n` puts locales in paths, so the status link in emails and pushes gets the person's prefix.
    const i18nOptions = (nuxt.options as { i18n?: { strategy?: string, defaultLocale?: string, locales?: Array<string | { code: string }> } }).i18n
    const i18nLocales = (i18nOptions?.locales ?? []).map(locale => typeof locale === 'string' ? locale : locale.code)
    const i18n = i18nLocales.length ? { strategy: i18nOptions?.strategy ?? 'prefix_except_default', defaultLocale: i18nOptions?.defaultLocale ?? null, locales: i18nLocales } : null
    nuxt.options.runtimeConfig.public.crew = { pages: { home: homePath, apply: applyPath, status: statusPath, invite: invitePath }, i18n }
    const runtime = nuxt.options.runtimeConfig as unknown as Record<string, unknown>
    runtime.crew = {
      ...(runtime.crew as Record<string, unknown> | undefined),
      rolePresets: options.rolePresets ?? [],
      defaultTeamKind: options.defaultTeamKind ?? 'default',
      phoneField: options.phoneField ?? 'phone',
    } satisfies CrewRuntimeConfig

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })
    // The crew columns on teams' `team_members`. Hosts generate and commit their own migrations for them. The phone
    // number of an application is stored on `users.phone`, which `@frigear-nu/users` owns.
    extendDatabaseTable(nuxt, {
      resolver,
      file: dialect => `./runtime/server/db/team-members.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'me', file: 'me/crew.get' },
      { method: 'get', path: 'operations/:operation/apply', file: 'public/apply.get' },
      { method: 'post', path: 'invites/:token/accept', file: 'public/invite-accept.post' },
      // `:operation` like the apply route: h3's router wants one parameter name per segment.
      { method: 'get', path: 'operations/:operation/members', file: 'public/members.get' },
      { method: 'get', path: 'members/:id', file: 'public/member.get' },
    ], { base: '/api/crew' })

    addModuleRoutes(resolver, [
      { method: 'get', path: 'operations/:operationId/settings', file: 'admin/settings.get' },
      { method: 'put', path: 'operations/:operationId/settings', file: 'admin/settings.put' },
      { method: 'get', path: 'operations/:operationId/members', file: 'admin/members.get' },
      { method: 'post', path: 'operations/:operationId/members', file: 'admin/members.post' },
      { method: 'post', path: 'operations/:operationId/members/approve', file: 'admin/members-approve.post' },
      { method: 'get', path: 'operations/:operationId/invites', file: 'admin/invites.get' },
      { method: 'post', path: 'operations/:operationId/invites', file: 'admin/invites.post' },
      { method: 'get', path: 'forms', file: 'admin/forms.get' },
      { method: 'get', path: 'users', file: 'admin/users.get' },
      { method: 'patch', path: 'members/:id', file: 'admin/member.patch' },
      { method: 'post', path: 'members/:id/approve', file: 'admin/member-approve.post' },
      { method: 'post', path: 'members/:id/reject', file: 'admin/member-reject.post' },
      { method: 'post', path: 'members/:id/withdraw', file: 'admin/member-withdraw.post' },
      { method: 'post', path: 'members/:id/waitlist', file: 'admin/member-waitlist.post' },
      { method: 'get', path: 'members/:id/submission', file: 'admin/member-submission.get' },
      { method: 'delete', path: 'invites/:id', file: 'admin/invite.delete' },
    ], { base: '/api/admin/crew' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // Answers `operations:participation:resolve` and `operations:participants:resolve`: who takes part in an operation.
    addServerPlugin(resolver.resolve('./runtime/server/plugins/participation'))
    // Registers an application when the operation's crew form is submitted (`forms:submitted`).
    addServerPlugin(resolver.resolve('./runtime/server/plugins/forms'))

    // The `crew-status-*` emails, as templates `@frigear-nu/email-templates` renders when installed.
    nuxt.hook('notify:email:templates', sources => sources.push({ dir: resolver.resolve('./runtime/emails') }))

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useCrewLinks', from: resolver.resolve('./runtime/app/composables/useCrewLinks') },
      { name: 'useCrewActions', from: resolver.resolve('./runtime/app/composables/useCrewActions') },
      { name: 'useCrewTranslate', from: resolver.resolve('./runtime/app/composables/useCrewTranslate') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    // The home page: the `crew.dashboard` tabs, the first of them the `crew.home` dashboard.
    addModulePages(MODULE_NAME, resolver, [
      { name: 'crew-home', path: homePath, file: './runtime/app/pages/home.vue' },
      { name: 'crew-apply', path: applyPath, file: './runtime/app/pages/apply.vue' },
      { name: 'crew-status', path: statusPath, file: './runtime/app/pages/status.vue' },
      { name: 'crew-invite', path: invitePath, file: './runtime/app/pages/invite.vue' },
    ])
    // Only for signed-in people: a route rule `@frigear-nu/authorization` enforces (Auth warns at build time without it).
    if (homePath) guardPages(nuxt, [homePath])

    // The tabs of the home page (`?tab=<id>`): Overview, the `crew.home` dashboard (every module's items for the person),
    // and My crew. Shifts adds My shifts and Swaps; any module can add one with `extendTabs(nuxt, 'crew.dashboard', ...)`.
    if (homePath) {
      const { extendTabs } = await import('@frigear-nu/widget/utils')
      extendTabs(nuxt, CREW_HOME_TABS, [
        { id: CREW_HOME_TAB.overview, component: resolver.resolve('./runtime/app/tabs/HomeOverview.vue'), order: 0, label: 'Overview', labelKey: 'crew.home.tabs.overview', icon: 'i-lucide-layout-dashboard' },
        ...(statusSetting === false
          ? []
          : [{ id: CREW_HOME_TAB.status, component: resolver.resolve('./runtime/app/tabs/HomeStatus.vue'), order: 10, label: 'My crew', labelKey: 'crew.home.tabs.status', icon: 'i-lucide-hand-heart', permission: crewAccess.permissions.read }]),
      ])
    }

    // The pages that moved into the hub answer with a redirect to their tab, so old links and bookmarks keep working.
    if (tabsOnly && homePath) {
      addPageRedirects(nuxt, {
        ...(homePath !== CREW_DEFAULT_PAGES.home ? { [CREW_DEFAULT_PAGES.home]: homePath } : {}),
        ...(statusSetting === true ? { [CREW_DEFAULT_PAGES.status]: crewHomeTab(homePath, CREW_HOME_TAB.status) } : {}),
      })
    }

    // A "Crew" tab on the staff operation page (`admin.operations`, owned by `@frigear-nu/operations`), without importing
    // operations: a tab for an area nobody renders is harmless. Before teams' tab (order 20).
    if (settings.operationsTab !== false && hasNuxtModule('@frigear-nu/widget') && hasNuxtModule('@frigear-nu/admin')) {
      const { extendTabs } = await import('@frigear-nu/widget/utils')
      extendTabs(nuxt, 'admin.operations', {
        id: 'crew',
        component: resolver.resolve('./runtime/app/tabs/Crew.vue'),
        order: 10,
        label: 'Crew',
        labelKey: 'crew.admin.tabs.crew',
        icon: 'i-lucide-hand-heart',
        permission: crewAccess.permissions.manage,
      })
    }

    // "Add to crew" on an inbox thread: the `inbox.thread.actions` slot of `@frigear-nu/inbox`, by name, so crew does not
    // depend on inbox (an area nobody renders is harmless). Staff with `crew:manage` see it.
    const { extendWidgets } = await import('@frigear-nu/widget/utils')
    extendWidgets(nuxt, 'inbox.thread.actions', {
      id: 'crew-add-to-crew',
      component: resolver.resolve('./runtime/app/widgets/InboxAddToCrew.vue'),
      order: 10,
      permission: crewAccess.permissions.manage,
    })

    // A "Crew" tab in the mobile tab bar, on the status page.
    if (statusPath && hasNuxtModule('@frigear-nu/mobile')) {
      const { extendMobileTabs } = await import('@frigear-nu/mobile/utils')
      extendMobileTabs(nuxt, {
        id: 'crew',
        to: statusPath,
        label: 'Crew',
        labelKey: 'crew.mobile.tab',
        icon: 'i-lucide-hand-heart',
        sfSymbol: 'person.3',
        sfSymbolActive: 'person.3.fill',
        requiresAuth: true,
      })
    }

    // The `crew.status` topic of notify's `notifyUser`, which the status message (`crew-send.ts`) goes through.
    extendNotificationTopics(nuxt, crewNotificationTopics)

    // Dashboard: this module's items on `crew.home` (`runtime/dashboard.ts`).
    extendDashboard(nuxt, CREW_DASHBOARD, crewDashboardItems(path => resolver.resolve(path)))

    // The Crew area of the hub's `dashboard` menu.
    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard' })
  },
})
