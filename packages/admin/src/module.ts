import {
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import { addModuleRoutes, getSearchIndexes, inlineModuleRuntime, registerLocales, registerModule, registerTailwindSource } from '@frigear-nu/module-kit/utils'
import { registerAccess } from '@frigear-nu/auth/utils'
import type { PermissionDefinition } from '@frigear-nu/auth/utils'
import { adminAccess, searchAccess } from './runtime/access'
import { extendMenu } from '@frigear-nu/menu/utils'
import { ADMIN_NAV_GROUPS } from './runtime/utils'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type { ModuleOptions, PublicModuleOptions } from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    admin?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    admin?: PublicModuleOptions
  }
}

/** The permission that opens the admin area (`admin.settings.permission`). */
const ADMIN_ACCESS_PERMISSION = adminAccess.permissions.access

const trimSlash = (path: string) => path.length > 1 ? path.replace(/\/+$/, '') : path

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/admin', configKey: 'admin' },
  defaults: {
    settings: {},
  },
  moduleDependencies: {
    '@frigear-nu/module-kit': { version: '>=0.0.0' },
    // The signed-in user is shown in the header (`useUserSession`).
    'nuxt-auth-utils': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.0' },
    '@frigear-nu/widget': { version: '>=0.0.0' },
    // Page pattern components (`PageHeading`, `SectionCard`, ...) and `useNavLinks`.
    '@frigear-nu/ui': { version: '>=0.0.0' },
    '@frigear-nu/auth': { version: '>=0.0.0', optional: true },
    '@frigear-nu/authorization': { version: '>=0.0.0', optional: true },
  },
  setup(options, nuxt) {
    registerModule('@frigear-nu/admin', nuxt)
    const resolver = createResolver(import.meta.url)
    inlineModuleRuntime(nuxt, resolver)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const settings = options.settings ?? {}
    const base = trimSlash(settings.base ?? '/admin')
    const dashboardPath = settings.dashboard === false
      ? undefined
      : typeof settings.dashboard === 'string' ? settings.dashboard : base

    nuxt.options.runtimeConfig.public.admin = { base, dashboard: dashboardPath, backTo: settings.backTo ?? '/' }

    // With @nuxtjs/i18n every page also exists under `/<locale>/...`, so rules apply to each prefix.
    const prefixes = ['', ...(nuxt.options.i18n?.locales ?? [])
      .map(locale => typeof locale === 'string' ? locale : locale.code)
      .map(code => `/${code}`)]
    const bases = prefixes.map(prefix => `${prefix}${base}`)

    // The admin area is only reachable by users holding `settings.permission` (default `admin:access`, granted to the
    // `admin` role). Route rules are enforced by @frigear-nu/auth on `/api/**` and by @frigear-nu/authorization on
    // pages; without authorization nothing guards the pages.
    const permission = settings.permission === false ? undefined : settings.permission ?? ADMIN_ACCESS_PERMISSION
    if ((settings as { roles?: unknown }).roles !== undefined) {
      throw new Error('[@frigear-nu/admin] `admin.settings.roles` was removed: use `admin.settings.permission` (a `resource:action` string, default `admin:access`) and give it to roles in `authorization.roles`.')
    }
    const guarded = !!permission && hasNuxtModule('@frigear-nu/authorization')
    if (permission) {
      if (guarded) {
        if (permission === ADMIN_ACCESS_PERMISSION) {
          registerAccess(nuxt, adminAccess)
        }
        const rules = nuxt.options.routeRules ||= {}
        for (const pattern of bases.map(prefixed => `${prefixed}/**`)) {
          rules[pattern] = { permission, ...rules[pattern] } as (typeof rules)[string]
        }
      }
      else {
        console.warn('[@frigear-nu/admin] @frigear-nu/authorization is not installed: the admin pages are not guarded. Install it or set `admin.settings.permission: false` and guard the area yourself.')
      }
    }

    // Every page under the base (including other modules', whenever they register) gets the shell unless it
    // chose a layout itself. A route rule rather than page meta, so registration order doesn't matter.
    if (settings.layout !== false) {
      // An `admin` layout of the app (`app/layouts/admin.vue`) or a layer wins: Nuxt scans the layouts into
      // `app.layouts` before `app:resolve`, so ours only fills the gap, and the route rule below applies whichever it
      // is. Not `addLayout`: its `app:templates` hook runs again on every `updateTemplates()` in dev, where the scan is
      // cached, finds our own earlier entry and warns that `admin` "is already provided by #build/admin.vue".
      nuxt.hook('app:resolve', (app) => {
        app.layouts.admin ||= { name: 'admin', file: resolver.resolve('./runtime/app/layouts/admin.vue') }
      })
      const rules = nuxt.options.routeRules ||= {}
      for (const prefixed of bases) {
        // `<base>/**` does not match the dashboard at `base` itself.
        for (const pattern of [prefixed, `${prefixed}/**`]) {
          rules[pattern] = { appLayout: 'admin', ...rules[pattern] } as (typeof rules)[string]
        }
      }
    }

    // An "Admin" entry in the account dropdown, hidden by `menus:filter` (authorization) from users without the permission.
    if (dashboardPath && guarded) {
      extendMenu(nuxt, 'account.dropdown', {
        id: 'admin',
        label: 'Admin',
        labelKey: 'admin.menu.label',
        description: 'Administration',
        descriptionKey: 'admin.menu.description',
        icon: 'i-lucide-shield-check',
        to: dashboardPath,
        order: 90,
        permission,
      })
    }

    // "Dashboard" alone in the Overview group, above the modules' own entries.
    if (dashboardPath) {
      extendMenu(nuxt, ADMIN_NAV_GROUPS.overview, {
        id: 'admin-dashboard',
        label: 'Dashboard',
        labelKey: 'admin.dashboard.title',
        icon: 'i-lucide-layout-dashboard',
        to: dashboardPath,
        order: 0,
      })
    }

    // Settings > Search: a button that runs module-kit's `search:reindex` task (`POST /api/admin/search/reindex`). All of
    // it (the permission, the route, the page and the menu entry) exists only when a module registered a search index
    // (`registerSearchIndex`): an app without one gets none of it. Indexes may be registered by modules set up after
    // this one, so it is decided once every module is set up: `@frigear-nu/auth` collects permissions from its
    // `modules:done` (the `auth:permissions` hook), and the route, menu entry and page are added at `modules:done` too.
    // (Without `@frigear-nu/auth` nothing collects the permission.)
    const searchPath = `${base}/search`
    let withSearch = false
    const searchPermissions = Object.values(searchAccess.definitions.permissions) as unknown as PermissionDefinition[]
    nuxt.hook('auth:permissions', (list) => {
      if (getSearchIndexes(nuxt).length) list.push(...searchPermissions)
    })
    nuxt.hook('modules:done', () => {
      if (!hasNuxtModule('@frigear-nu/auth') || !getSearchIndexes(nuxt).length) return
      withSearch = true
      addModuleRoutes(resolver, [{ method: 'post', path: 'reindex', file: 'search/reindex.post' }], { base: '/api/admin/search' })
      extendMenu(nuxt, ADMIN_NAV_GROUPS.settings, {
        id: 'admin-search',
        label: 'Search',
        labelKey: 'admin.searchIndex.title',
        description: 'Rebuild the search columns after an update.',
        descriptionKey: 'admin.searchIndex.description',
        icon: 'i-lucide-search',
        to: searchPath,
        order: 90,
        permission: searchAccess.permissions.reindex,
      })
    })

    extendPages((pages) => {
      if (withSearch && !pages.some(page => page.path === searchPath)) {
        pages.push({ name: 'admin-search', path: searchPath, file: resolver.resolve('./runtime/app/pages/search.vue'), meta: { moduleName: '@frigear-nu/admin' } })
      }
      if (dashboardPath && !pages.some(page => page.path === dashboardPath)) {
        // `moduleName` marks the page as module-owned, so it is never looked up in `@nuxt/content`.
        pages.push({ name: 'admin-dashboard', path: dashboardPath, file: resolver.resolve('./runtime/app/pages/dashboard.vue'), meta: { moduleName: '@frigear-nu/admin' } })
      }
    })
  },
})
