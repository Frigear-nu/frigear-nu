import {
  addComponentsDir,
  addImports,
  addLayout,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  addModulePages,
  addOptionalMenuSource,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
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
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // The profile, email and password forms call its self-service routes.
    '@frigear-nu/users': {
      version: '>=0.0.1',
    },
    // Page pattern components (`PageHeading`, `SectionCard`, ...), `useNavLinks` and the error/format helpers.
    '@frigear-nu/ui': { version: '>=0.0.0' },
    '@frigear-nu/menu': {
      version: '>=0.0.1',
      optional: true,
    },
    // The overview renders the `account.overview` widget area when it is installed.
    '@frigear-nu/widget': {
      version: '>=0.0.0',
      optional: true,
    },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/account', nuxt)
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}
    const withMenus = hasNuxtModule('@frigear-nu/menu')

    addImports([
      { name: 'useAccount', from: resolver.resolve('./runtime/app/composables/useAccount') },
      { name: 'useAccountNav', from: resolver.resolve('./runtime/app/composables/useAccountNav') },
    ])

    // Profile/security pages are opt-in (`settings.pages.profile`/`settings.pages.security`)
    // rather than enabled by default, since they require `@nuxt/ui` to be installed in the
    // consuming app. The dashboard/index page additionally requires `@frigear-nu/menu`,
    // since it only lists the tiles contributed through that module.
    const profilePath = resolvePagePath(settings.pages?.profile, '/account/profile')
    const securityPath = resolvePagePath(settings.pages?.security, '/account/security')
    const documentsPath = resolvePagePath(settings.pages?.documents, '/account/documents')
    const apiTokensPath = resolvePagePath(settings.pages?.apiTokens, '/account/api-tokens')
    const indexPath = withMenus ? resolvePagePath(settings.pages?.index, '/account') : undefined

    if (!withMenus && settings.pages?.index) {
      console.warn('[@frigear-nu/account] `settings.pages.index` was set, but `@frigear-nu/menu` is not installed - skipping the dashboard page.')
    }

    nuxt.options.runtimeConfig.public.account = {
      pages: { index: indexPath, profile: profilePath, security: securityPath, documents: documentsPath, apiTokens: apiTokensPath },
      documents: settings.documents ?? [],
    }

    addModulePages('@frigear-nu/account', resolver, [
      { name: 'account-index', path: indexPath, file: './runtime/app/pages/index.vue' },
      { name: 'account-profile', path: profilePath, file: './runtime/app/pages/profile.vue' },
      { name: 'account-documents', path: documentsPath, file: './runtime/app/pages/documents.vue' },
      { name: 'account-security', path: securityPath, file: './runtime/app/pages/security.vue' },
      { name: 'account-api-tokens', path: apiTokensPath, file: './runtime/app/pages/api-tokens.vue' },
    ])

    // With @nuxtjs/i18n every page also exists under `/<locale>/...`, so rules apply to each prefix.
    const prefixes = ['', ...(nuxt.options.i18n?.locales ?? [])
      .map(locale => typeof locale === 'string' ? locale : locale.code)
      .map(code => `/${code}`)]
    // Configured pages outside `/account` (e.g. `pages.profile: '/me'`) belong to the area as well.
    const outside = [indexPath, profilePath, securityPath, documentsPath, apiTokensPath]
      .filter((path): path is string => !!path && path !== '/account' && !path.startsWith('/account/'))
    const areaPatterns = prefixes.flatMap(prefix => [`${prefix}/account`, `${prefix}/account/**`, ...outside.map(path => `${prefix}${path}`)])

    // Every account page (including those other modules add under /account: membership, tickets, applications) gets
    // the account shell unless it chose a layout itself. A route rule rather than page meta, so registration order
    // doesn't matter.
    if (settings.layout !== false) {
      addLayout({ src: resolver.resolve('./runtime/app/layouts/account.vue'), filename: 'account.vue' }, 'account')
      const rules = nuxt.options.routeRules ||= {}
      for (const pattern of areaPatterns) {
        rules[pattern] = { appLayout: 'account', ...rules[pattern] } as (typeof rules)[string]
      }
    }

    // Everything under /account is for signed-in users only, including the pages other modules add there
    // (membership, tickets, applications). Route rules are enforced by @frigear-nu/authorization (also on the
    // server); with @nuxtjs/i18n every page also exists under `/<locale>/...`, so rules apply to each prefix.
    if (hasNuxtModule('@frigear-nu/authorization')) {
      const rules = nuxt.options.routeRules ||= {}
      for (const pattern of areaPatterns) {
        rules[pattern] = { authenticated: true, ...rules[pattern] } as (typeof rules)[string]
      }
    }
    else {
      console.warn('[@frigear-nu/account] @frigear-nu/authorization is not installed: the account pages are not guarded. Install it and guard `/account/**` yourself.')
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })

    // Negative priority: a component with the same name in the app (or a layer) always wins over these defaults,
    // which is how a host overrides single parts (e.g. `AccountHeaderRight`) without replacing the rest.
    addComponentsDir({
      path: resolver.resolve('./runtime/app/components'),
      priority: -1,
    })
  },
})
