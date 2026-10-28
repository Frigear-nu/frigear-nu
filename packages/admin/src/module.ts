import {
  addLayout,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import { registerLocales, registerModule, registerTailwindSource } from '@frigear-nu/module-kit/utils'
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
    '@frigear-nu/authorization': { version: '>=0.0.0', optional: true },
  },
  setup(options, nuxt) {
    registerModule('@frigear-nu/admin', nuxt)
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const settings = options.settings ?? {}
    const base = trimSlash(settings.base ?? '/admin')
    const dashboardPath = settings.dashboard === false
      ? undefined
      : typeof settings.dashboard === 'string' ? settings.dashboard : base

    nuxt.options.runtimeConfig.public.admin = { base, dashboard: dashboardPath }

    addLayout({ src: resolver.resolve('./runtime/app/layouts/admin.vue'), filename: 'admin.vue' }, 'admin')

    // With @nuxtjs/i18n every page also exists under `/<locale>/...`, so rules apply to each prefix.
    const prefixes = ['', ...(nuxt.options.i18n?.locales ?? [])
      .map(locale => typeof locale === 'string' ? locale : locale.code)
      .map(code => `/${code}`)]
    const bases = prefixes.map(prefix => `${prefix}${base}`)

    // The admin area is only reachable by the configured roles. Route rules are enforced by
    // @frigear-nu/authorization (also on the server); without it nothing guards the pages.
    if (settings.roles !== false) {
      if (hasNuxtModule('@frigear-nu/authorization')) {
        const rules = nuxt.options.routeRules ||= {}
        for (const pattern of bases.map(prefixed => `${prefixed}/**`)) {
          rules[pattern] = { roles: settings.roles ?? ['admin'], ...rules[pattern] } as (typeof rules)[string]
        }
      }
      else {
        console.warn('[@frigear-nu/admin] @frigear-nu/authorization is not installed: the admin pages are not guarded on the client. Install it or set `admin.settings.roles: false` and guard the area yourself.')
      }
    }

    // Every page under the base (including other modules', whenever they register) gets the shell unless it
    // chose a layout itself. A route rule rather than page meta, so registration order doesn't matter.
    if (settings.layout !== false) {
      const rules = nuxt.options.routeRules ||= {}
      for (const prefixed of bases) {
        // `<base>/**` does not match the dashboard at `base` itself.
        for (const pattern of [prefixed, `${prefixed}/**`]) {
          rules[pattern] = { appLayout: 'admin', ...rules[pattern] } as (typeof rules)[string]
        }
      }
    }

    // An "Admin" entry in the account dropdown, shown by the dropdown only to users holding one of the roles.
    if (dashboardPath && settings.roles !== false) {
      extendMenu(nuxt, 'account.dropdown', {
        id: 'admin',
        label: 'Admin',
        labelKey: 'admin.menu.label',
        description: 'Administration',
        descriptionKey: 'admin.menu.description',
        icon: 'i-lucide-shield-check',
        to: dashboardPath,
        order: 90,
        meta: { roles: settings.roles ?? ['admin'] },
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
