import {
  addComponentsDir,
  addImports,
  addServerHandler,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import { registerModule, extendDatabaseTable } from '@frigear-nu/module-kit/utils'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type { ModuleOptions, PublicModuleOptions } from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    account?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    account?: PublicModuleOptions
  }
}

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/account', configKey: 'account' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
    },
    '@frigear-nu/module-kit': {
      version: '>=0.0.1',
    },
    '@frigear-nu/users': {
      version: '>=0.0.1',
    },
    '@frigear-nu/menus': {
      version: '>=0.0.1',
      optional: true,
    },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/account', nuxt)
    const resolver = createResolver(import.meta.url)
    const settings = options.settings ?? {}
    const withMenus = hasNuxtModule('@frigear-nu/menus')

    addServerHandler({
      route: '/api/account/profile',
      method: 'post',
      handler: resolver.resolve('./runtime/server/routes/account/profile.post'),
    })
    addServerHandler({
      route: '/api/account/change-email',
      method: 'post',
      handler: resolver.resolve('./runtime/server/routes/account/change-email.post'),
    })
    addServerHandler({
      route: '/api/account/change-password',
      method: 'post',
      handler: resolver.resolve('./runtime/server/routes/account/change-password.post'),
    })

    addImports([{ name: 'useAccount', from: resolver.resolve('./runtime/app/composables/useAccount') }])

    // Profile/security pages are opt-in (`settings.pages.profile`/`settings.pages.security`)
    // rather than enabled by default, since they require `@nuxt/ui` to be installed in the
    // consuming app. The dashboard/index page additionally requires `@frigear-nu/menus`,
    // since it only lists the tiles contributed through that module.
    const profilePath = resolvePagePath(settings.pages?.profile, '/account/profile')
    const securityPath = resolvePagePath(settings.pages?.security, '/account/security')
    const indexPath = withMenus ? resolvePagePath(settings.pages?.index, '/account') : undefined

    if (!withMenus && settings.pages?.index) {
      console.warn('[@frigear-nu/account] `settings.pages.index` was set, but `@frigear-nu/menus` is not installed - skipping the dashboard page.')
    }

    nuxt.options.runtimeConfig.public.account = {
      pages: { index: indexPath, profile: profilePath, security: securityPath },
    }

    if (indexPath || profilePath || securityPath) {
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))

        if (indexPath && !existingPaths.has(indexPath)) {
          pages.push({ name: 'account-index', path: indexPath, file: resolver.resolve('./runtime/app/pages/index.vue') })
        }
        if (profilePath && !existingPaths.has(profilePath)) {
          pages.push({ name: 'account-profile', path: profilePath, file: resolver.resolve('./runtime/app/pages/profile.vue') })
        }
        if (securityPath && !existingPaths.has(securityPath)) {
          pages.push({ name: 'account-security', path: securityPath, file: resolver.resolve('./runtime/app/pages/security.vue') })
        }
      })
    }

    if (withMenus) {
      const { registerMenuSource } = await import('@frigear-nu/menus/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })
    }

    addComponentsDir({
      path: resolver.resolve('./runtime/app/components'),
    })

    extendDatabaseTable(nuxt, {
      resolver,
      file: dialect => `./runtime/server/db/schema.${dialect}`,
    })
  },
})
