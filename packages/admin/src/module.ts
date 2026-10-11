import {
  addComponent,
  addLayout,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import { registerLocales, registerModule } from '@frigear-nu/module-kit/utils'
import { extendMenu } from '@frigear-nu/menu/utils'
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
    '@frigear-nu/authorization': { version: '>=0.0.0', optional: true },
  },
  setup(options, nuxt) {
    registerModule('@frigear-nu/admin', nuxt)
    const resolver = createResolver(import.meta.url)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const settings = options.settings ?? {}
    const base = trimSlash(settings.base ?? '/admin')
    const dashboardPath = settings.dashboard === false
      ? undefined
      : typeof settings.dashboard === 'string' ? settings.dashboard : base

    nuxt.options.runtimeConfig.public.admin = { base, dashboard: dashboardPath }

    addLayout({ src: resolver.resolve('./runtime/app/layouts/admin.vue'), filename: 'admin.vue' }, 'admin')
    addComponent({ name: 'AdminPageHeader', filePath: resolver.resolve('./runtime/app/components/AdminPageHeader.vue') })

    // The admin area is only reachable by the configured roles. Route rules are enforced by
    // @frigear-nu/authorization (also on the server); without it nothing guards the pages.
    if (settings.roles !== false) {
      if (hasNuxtModule('@frigear-nu/authorization')) {
        const pattern = `${base}/**`
        const rules = nuxt.options.routeRules ||= {}
        rules[pattern] = { roles: settings.roles ?? ['admin'], ...rules[pattern] } as (typeof rules)[string]
      }
      else {
        console.warn('[@frigear-nu/admin] @frigear-nu/authorization is not installed: the admin pages are not guarded on the client. Install it or set `admin.settings.roles: false` and guard the area yourself.')
      }
    }

    // Every page under the base (including other modules', whenever they register) gets the shell unless it
    // chose a layout itself. A route rule rather than page meta, so registration order doesn't matter.
    if (settings.layout !== false) {
      const rules = nuxt.options.routeRules ||= {}
      const pattern = `${base}/**`
      rules[pattern] = { appLayout: 'admin', ...rules[pattern] } as (typeof rules)[string]
      // The dashboard itself lives at `base`, which `<base>/**` does not match.
      rules[base] = { appLayout: 'admin', ...rules[base] } as (typeof rules)[string]
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

    extendPages((pages) => {
      if (dashboardPath && !pages.some(page => page.path === dashboardPath)) {
        pages.push({ name: 'admin-dashboard', path: dashboardPath, file: resolver.resolve('./runtime/app/pages/dashboard.vue') })
      }
    })
  },
})
