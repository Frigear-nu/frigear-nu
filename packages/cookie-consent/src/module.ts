import {
  addComponentsDir,
  addImports,
  addServerImports,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import { addModuleRoutes, registerModule, registerLocales, extendDatabaseTable, registerTailwindSource, inlineModuleRuntime, addOptionalImports } from '@frigear-nu/module-kit/utils'
import { DEFAULT_CATEGORIES, computeVersion, mergeCategories } from './runtime/utils/consent'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type {
  ModuleOptions,
  PublicModuleOptions,
  ConsentCategory,
  ConsentCookie,
  ConsentDto,
  ConsentMessages,
  ConsentState,
  Translated,
} from './types'

// Pulls the Nuxt / Nitro type augmentations (config, hooks, public runtime config) into the module graph.
export type * from './schema'

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 180
const DEFAULT_ICON = 'lucide:cookie'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/cookie-consent', configKey: 'cookieConsent' },
  defaults: {
    cookieName: 'cookie-consent',
    maxAge: DEFAULT_MAX_AGE,
    excludeRoutes: ['/authorize'],
    collapseOnScroll: true,
    icon: DEFAULT_ICON,
  },
  moduleDependencies: {
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    // Declared (optional) so they are set up first and `hasNuxtModule` below does not depend on the module order:
    // with `users` the consent is also stored on the signed-in user.
    '@frigear-nu/auth': { version: '>=0.0.1', optional: true },
    '@frigear-nu/users': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/cookie-consent', nuxt)

    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const persistToUser = (options.persistToUser ?? true) && hasNuxtModule('@frigear-nu/users')
    // `useUserSession` (nuxt-auth-utils, through `@frigear-nu/auth`) is only called when `persistToUser` is on.
    // Not `hasNuxtModule('nuxt-auth-utils')`: that module registers itself as `auth-utils`.
    addOptionalImports(nuxt, '#cookie-consent/optional', [{
      name: 'useUserSession',
      available: () => hasNuxtModule('@frigear-nu/auth', nuxt),
      fallback: `() => { throw new Error('[@frigear-nu/cookie-consent] \`persistToUser\` needs \`@frigear-nu/users\`') }`,
      fallbackType: '() => { loggedIn: import(\'vue\').Ref<boolean> }',
    }])

    addImports([
      { name: 'useCookieConsent', from: resolver.resolve('./runtime/app/composables/useCookieConsent') },
      { name: 'onCookieConsent', from: resolver.resolve('./runtime/app/composables/useCookieConsent') },
      { name: 'useConsentT', from: resolver.resolve('./runtime/app/composables/useConsentT') },
    ])
    addServerImports([
      { name: 'getCookieConsent', from: resolver.resolve('./runtime/server/utils/consent') },
      { name: 'hasCookieConsent', from: resolver.resolve('./runtime/server/utils/consent') },
    ])
    inlineModuleRuntime(nuxt, resolver)
    // Negative priority: a component with the same name in the app (or a layer) always wins over these defaults.
    addComponentsDir({ path: resolver.resolve('./runtime/app/components'), priority: -1 })

    if (persistToUser) {
      addModuleRoutes(resolver, [
        { method: 'get', path: '', file: 'cookie-consent/index.get' },
        { method: 'post', path: '', file: 'cookie-consent/index.post' },
      ], { base: '/api/cookie-consent' })
      extendDatabaseTable(nuxt, {
        resolver,
        file: dialect => `./runtime/server/db/schema.${dialect}`,
      })
    }

    // Nuxt Icon only bundles icons it finds by scanning the app's own code and skips node_modules, so the
    // component's icon would render empty in a consuming app. Push it into the client bundle explicitly.
    const icon = options.icon || DEFAULT_ICON
    nuxt.hook('icon:clientBundleIcons' as never, ((icons: Set<string>) => {
      icons.add(icon.replace(/^i[-:]/, ''))
    }) as never)

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
        policyLabel: options.policyLabel,
        persistToUser,
        icon,
      } satisfies PublicModuleOptions
    })
  },
})
