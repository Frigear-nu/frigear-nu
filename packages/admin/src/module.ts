import {
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import { inlineModuleRuntime, registerLocales, registerModule, registerTailwindSource } from '@frigear-nu/module-kit/utils'
import { registerAccess } from '@frigear-nu/auth/utils'
import { adminAccess } from './runtime/access'
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

    extendPages((pages) => {
      if (dashboardPath && !pages.some(page => page.path === dashboardPath)) {
        // `moduleName` marks the page as module-owned, so it is never looked up in `@nuxt/content`.
        pages.push({ name: 'admin-dashboard', path: dashboardPath, file: resolver.resolve('./runtime/app/pages/dashboard.vue'), meta: { moduleName: '@frigear-nu/admin' } })
      }
    })
  },
})
