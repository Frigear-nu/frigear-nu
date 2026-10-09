import {
  addComponentsDir,
  addImports,
  addServerHandler,
  addServerImports,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import { registerModule, registerLocales, extendDatabaseTable } from '@frigear-nu/module-kit/utils'
import { DEFAULT_CATEGORIES, computeVersion, mergeCategories } from './runtime/utils/consent'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type {
  ModuleOptions,
  PublicModuleOptions,
  ConsentCategory,
  ConsentCookie,
  ConsentMessages,
  ConsentState,
  Localized,
} from './types'

// Pulls the Nuxt / Nitro type augmentations (config, hooks, public runtime config) into the module graph.
export type * from './schema'

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 180

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/cookie-consent', configKey: 'cookieConsent' },
  defaults: {
    cookieName: 'cookie-consent',
    maxAge: DEFAULT_MAX_AGE,
    excludeRoutes: ['/authorize'],
    collapseOnScroll: true,
  },
  moduleDependencies: {
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/cookie-consent', nuxt)

    const resolver = createResolver(import.meta.url)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const persistToUser = (options.persistToUser ?? true) && hasNuxtModule('@frigear-nu/users')

    addImports([
      { name: 'useCookieConsent', from: resolver.resolve('./runtime/app/composables/useCookieConsent') },
      { name: 'onCookieConsent', from: resolver.resolve('./runtime/app/composables/useCookieConsent') },
      { name: 'useConsentT', from: resolver.resolve('./runtime/app/composables/useConsentT') },
    ])
    addServerImports([
      { name: 'getCookieConsent', from: resolver.resolve('./runtime/server/utils/consent') },
      { name: 'hasCookieConsent', from: resolver.resolve('./runtime/server/utils/consent') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    if (persistToUser) {
      addServerHandler({ route: '/api/cookie-consent', method: 'get', handler: resolver.resolve('./runtime/server/routes/cookie-consent/index.get') })
      addServerHandler({ route: '/api/cookie-consent', method: 'post', handler: resolver.resolve('./runtime/server/routes/cookie-consent/index.post') })
      extendDatabaseTable(nuxt, {
        name: 'users',
        resolver,
        file: dialect => `./runtime/server/db/schema.${dialect}`,
      })
    }

    // Other modules register categories through `extendCookieConsent` during their own `setup()`;
    // everything is merged once all modules are done, so registration order doesn't matter.
    nuxt.hook('modules:done', async () => {
      const categories = mergeCategories(
        options.categories ?? DEFAULT_CATEGORIES,
        nuxt.options.cookieConsent?._categories ?? [],
      )
      await nuxt.callHook('cookie-consent:resolved', categories)

      nuxt.options.runtimeConfig.public.cookieConsent = {
        cookieName: options.cookieName!,
        maxAge: options.maxAge!,
        version: computeVersion(options.version, categories),
        categories,
        excludeRoutes: options.excludeRoutes ?? [],
        collapseThreshold: options.collapseOnScroll === false ? false : typeof options.collapseOnScroll === 'number' ? options.collapseOnScroll : 80,
        policyUrl: options.policyUrl,
        persistToUser,
      } satisfies PublicModuleOptions
    })
  },
})
