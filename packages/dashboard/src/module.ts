import {
  addComponent,
  addImports,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalImports,
  addOptionalMenuSource,
  defineVirtualRegistry,
  inlineModuleRuntime,
  registerLocales,
  registerModule,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import type { RegisteredWidget } from '@frigear-nu/widget/utils'
import type { DashboardPublicConfig, DashboardRegistryEntry, ModuleOptions } from './types'
import { getDashboardItems } from './runtime/utils/dashboard'
import { dashboardOfArea, dashboardRegistryTemplate, isModuleConditionMet, resolveDashboardRegistry } from './runtime/shared/registry'
import { resolveHomeTab } from './runtime/shared/home-tab'
import { resolveHub } from './runtime/shared/hub'

export type * from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    dashboard?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    dashboard: DashboardPublicConfig
  }
}

const MODULE_NAME = '@frigear-nu/dashboard'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'dashboard', compatibility: { nuxt: '>=4.0.0' } },
  defaults: {
    homeTab: { dashboard: 'crew.home', path: '/crew' },
  },
  moduleDependencies: {
    '@frigear-nu/module-kit': { version: '>=0.0.0' },
    // Items are widgets of the area `dashboard.<name>`, filtered by `widgets:filter`.
    '@frigear-nu/widget': { version: '>=0.0.0' },
    // `StatCard`, `ListCard`, `surfaceClass`, `useConfirmDialog` (and Nuxt UI through it).
    '@frigear-nu/ui': { version: '>=0.0.0' },
    // Soft: the per-user layout is stored as a `managed` preference when installed (read and written through
    // `/api/dashboard/me/layouts`), else kept for the session.
    '@frigear-nu/preferences': { version: '>=0.0.0', optional: true },
    // Soft: the Home tab and the `mobile` platform.
    '@frigear-nu/mobile': { version: '>=0.0.0', optional: true },
    // Soft: whether someone is signed in, so a layout is only saved for a user; with Preferences, the `authorize` of
    // the layout routes and their `dashboard:layouts` permission.
    '@frigear-nu/auth': { version: '>=0.0.0', optional: true },
    // Soft: the hub's navigation is the `dashboard` menu (other modules add their areas to it), and its entry in
    // `account.dropdown`. Without it the hub lists only its Overview.
    '@frigear-nu/menu': { version: '>=0.0.0', optional: true },
    // Soft: guards the hub (signed-in only, through `guardPages`).
    '@frigear-nu/authorization': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    inlineModuleRuntime(nuxt, resolver)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    addImports([
      { name: 'useDashboard', from: resolver.resolve('./runtime/app/composables/useDashboard') },
      { name: 'useDashboardItem', from: resolver.resolve('./runtime/app/composables/useDashboardItem') },
      { name: 'useDashboardLayout', from: resolver.resolve('./runtime/app/composables/useDashboardLayout') },
      { name: 'useDashboardPlatform', from: resolver.resolve('./runtime/app/composables/useDashboardPlatform') },
      { name: 'dashboardSpanClass', from: resolver.resolve('./runtime/app/utils/span') },
      { name: 'useSavedDashboardLayouts', from: resolver.resolve('./runtime/app/composables/useSavedDashboardLayouts') },
      { name: 'useDashboardNav', from: resolver.resolve('./runtime/app/composables/useDashboardNav') },
    ])
    for (const name of ['Dashboard', 'DashboardGrid', 'DashboardItem', 'ChartCard', 'ActionCard', 'EmptyCard']) {
      addComponent({ name, filePath: resolver.resolve(`./runtime/app/components/${name}.vue`) })
    }

    // Layouts are saved through `/api/dashboard/me/layouts`, called with the cookie session: with Auth in client mode (a
    // Capacitor app, a bearer token) there is none, so the layout stays a session one there.
    // Auth may be installed only later (as a dependency of Preferences), so its mode helper is loaded whenever the
    // package resolves, and the mode is read once every module is done.
    const resolveAuthMode = await import('@frigear-nu/auth/mode').then(mod => mod.resolveAuthMode, () => undefined)
    const persistable = () => hasNuxtModule('@frigear-nu/preferences', nuxt)
      && hasNuxtModule('@frigear-nu/auth', nuxt)
      && resolveAuthMode?.(nuxt) === 'server'

    // Optional modules' composables, with stand-ins when they are not installed.
    addOptionalImports(nuxt, '#dashboard/optional', [
      {
        name: 'useSavedDashboardLayouts',
        available: persistable,
        fallback: 'undefined',
        fallbackType: `undefined | typeof import(${JSON.stringify(resolver.resolve('./runtime/app/composables/useSavedDashboardLayouts'))}).useSavedDashboardLayouts`,
      },
      {
        name: 'useUserSession',
        available: () => hasNuxtModule('@frigear-nu/auth', nuxt),
        fallback: 'undefined',
        fallbackType: `undefined | (() => { loggedIn: import('vue').Ref<boolean> | import('vue').ComputedRef<boolean>, user: import('vue').Ref<{ id?: string | number } | null | undefined> })`,
      },
      {
        name: 'useMenu',
        available: () => hasNuxtModule('@frigear-nu/menu', nuxt),
        fallback: 'undefined',
        fallbackType: `undefined | ((path: string) => PromiseLike<unknown> & { data: import('vue').Ref<import('@frigear-nu/menu').MenuItem[] | null | undefined> })`,
      },
      {
        name: 'useCapacitor',
        available: () => hasNuxtModule('@frigear-nu/mobile', nuxt),
        fallback: 'undefined',
        fallbackType: `undefined | (() => { isNative: boolean })`,
      },
    ])

    // `when.module` is decided now: the registry only ships items whose module is installed.
    const hasModule = (name: string) => hasNuxtModule(name, nuxt)
    defineVirtualRegistry(nuxt, {
      filename: 'dashboard/registry.mjs',
      alias: '#dashboard/registry',
      collect: () => resolveDashboardRegistry(getDashboardItems(nuxt), hasModule),
      contents: dashboardRegistryTemplate,
    })
    // ...and the widget registry drops their components, so a component of an absent module is never bundled.
    pruneWidgetsByCondition(nuxt, hasModule)

    addTypeTemplate({
      filename: 'types/dashboard-registry.d.ts',
      getContents: () => `declare module '#dashboard/registry' {
  import type { DashboardRegistryEntry } from ${JSON.stringify(resolver.resolve('./types'))}
  export const dashboards: Record<string, Record<string, DashboardRegistryEntry>>
}
`,
    })

    // Per-user layout: one `managed` preference key, when Preferences is installed (its definitions are collected
    // lazily, so the order of the modules does not matter). It stays out of the session cookie and `PATCH
    // /api/preferences` refuses it: the caller's own layouts are read and written through `/api/dashboard/me/layouts`
    // (`dashboard:layouts`, implicit for every signed-in user). Preferences needs Auth, so both are there.
    if (hasNuxtModule('@frigear-nu/preferences', nuxt)) {
      const { addUserPreferences } = await import('@frigear-nu/preferences/utils')
      addUserPreferences(nuxt, { path: resolver.resolve('./runtime/preferences') })
      const [{ registerAccess }, { dashboardAccess }] = await Promise.all([
        import('@frigear-nu/auth/utils'),
        import('./runtime/access'),
      ])
      registerAccess(nuxt, dashboardAccess)
      addModuleRoutes(resolver, [
        { method: 'get', path: 'me/layouts', file: 'me/layouts.get' },
        { method: 'patch', path: 'me/layouts', file: 'me/layouts.patch' },
      ], { base: '/api/dashboard' })
    }

    // Mobile: a Home tab and its page. Without mobile a web app places `<Dashboard>` itself.
    const home = resolveHomeTab(options.homeTab, { mobile: hasNuxtModule('@frigear-nu/mobile', nuxt) })
    const publicConfig = nuxt.options.runtimeConfig.public as { dashboard?: Partial<DashboardPublicConfig> }
    publicConfig.dashboard = { home: home?.dashboard ?? '', pages: {}, homeDashboard: '', ...publicConfig.dashboard }
    if (home) {
      addModulePages(MODULE_NAME, resolver, [{ name: 'dashboard-home', path: home.path, file: './runtime/app/pages/home.vue' }])
      const { extendMobileTabs } = await import('@frigear-nu/mobile/utils')
      extendMobileTabs(nuxt, home.tab)
    }

    // The signed-in hub (`settings.pages.home`).
    await setupHub(nuxt, resolver, options)
  },
})

/**
 * The hub page, its `dashboard` layout, the area's route rules and guard, and the `dashboard` menu. Nothing when the
 * hub is off (`settings.pages.home: false`, or no `@frigear-nu/auth`).
 */
async function setupHub(nuxt: Nuxt, resolver: ReturnType<typeof createResolver>, options: ModuleOptions) {
  // Whether Auth is installed is only known once every module is done (it may come in later, as a dependency of another
  // module), but Authorization collects the guard's route rules in its own `modules:done` hook, which may run first. So
  // the rules are set now, whenever Auth's package resolves, and the rest waits. Without the Auth module nothing reads
  // the rules, and there is no page for them to match.
  const planned = resolveHub(options.settings, { auth: true })
  if (!planned) return
  const authUtils = await import('@frigear-nu/auth/utils').catch(() => undefined)
  if (!authUtils) return

  // Every page under the hub (modules add their areas there) gets the hub layout unless it chose one itself, and is for
  // signed-in users only. With @nuxtjs/i18n every page also exists under `/<locale>/...`.
  const areaBase = [planned.path, `${planned.path}/**`]
  const rules = nuxt.options.routeRules ||= {}
  for (const pattern of authUtils.localizedRoutePatterns(nuxt, areaBase)) {
    rules[pattern] = { appLayout: 'dashboard', ...rules[pattern] } as (typeof rules)[string]
  }
  authUtils.guardPages(nuxt, areaBase)

  nuxt.hook('modules:done', () => {
    const logger = useLogger('dashboard')
    const hub = resolveHub(options.settings, { auth: hasNuxtModule('@frigear-nu/auth', nuxt) })
    if (!hub) {
      if (typeof options.settings?.pages?.home === 'string') {
        logger.warn('`dashboard.settings.pages.home` was set, but `@frigear-nu/auth` is not installed - skipping the hub.')
      }
      return
    }
    if (!hasNuxtModule('@frigear-nu/authorization', nuxt)) {
      logger.warn(`@frigear-nu/authorization is not installed: the hub is not guarded. Install it and guard \`${hub.path}/**\` yourself.`)
    }

    const publicConfig = nuxt.options.runtimeConfig.public.dashboard
    publicConfig.pages = { ...publicConfig.pages, home: hub.path }
    publicConfig.homeDashboard = hub.dashboard

    addModulePages(MODULE_NAME, resolver, [{ name: 'dashboard-hub', path: hub.path, file: './runtime/app/pages/hub.vue' }])

    // A `dashboard` layout of the app (`app/layouts/dashboard.vue`) or a layer wins: Nuxt scans the layouts into
    // `app.layouts` before `app:resolve`, so ours only fills the gap (the same as the account layout).
    nuxt.hook('app:resolve', (app) => {
      app.layouts.dashboard ||= { name: 'dashboard', file: resolver.resolve('./runtime/app/layouts/dashboard.vue') }
    })

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard' })
  })
}

/** Removes items whose `when.module` is absent from their dashboard's widget area, before the widget registry is written. */
function pruneWidgetsByCondition(nuxt: Nuxt, hasModule: (name: string) => boolean) {
  const logger = useLogger('dashboard')
  const hooks = nuxt.hooks as unknown as { hook: (name: 'widgets:resolved', fn: (areas: Record<string, RegisteredWidget[]>) => void) => void }
  hooks.hook('widgets:resolved', (areas) => {
    const dashboards = getDashboardItems(nuxt)
    for (const [area, widgets] of Object.entries(areas)) {
      const name = dashboardOfArea(area)
      if (name === undefined) continue
      const entries = new Map((dashboards[name] ?? []).map((entry: DashboardRegistryEntry) => [entry.id, entry]))
      // A widget added with plain `extendWidgets` has no dashboard entry, so `useDashboard` never shows it.
      const unregistered = widgets.filter(widget => !entries.has(widget.id)).map(widget => widget.id)
      if (unregistered.length && !nuxt.options._prepare) {
        logger.warn(`Widgets ${unregistered.map(id => `"${id}"`).join(', ')} are in the area "${area}" but were not added with \`extendDashboard\`, so dashboard "${name}" does not show them. Use \`extendDashboard(nuxt, '${name}', ...)\` instead of \`extendWidgets\`.`)
      }
      // In place: the widget registry renders this same list when its template is written.
      const kept = widgets.filter((widget) => {
        const entry = entries.get(widget.id)
        return !entry || isModuleConditionMet(entry, hasModule)
      })
      widgets.splice(0, widgets.length, ...kept)
    }
  })
}
