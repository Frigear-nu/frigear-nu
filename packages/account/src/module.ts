import {
  addComponentsDir,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  addModulePages,
  addOptionalMenuSource,
  defineVirtualRegistry,
  getBootstrapProviders,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
  inlineModuleRuntime,
  addOptionalImports,
} from '@frigear-nu/module-kit/utils'
import type { ModuleOptions, PublicModuleOptions } from './types'
import { withAppMiddleware, type AppMiddlewareRule } from './route-middleware'

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
    inlineModuleRuntime(nuxt, resolver)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}
    const withMenus = hasNuxtModule('@frigear-nu/menu')
    // `@frigear-nu/menu` is optional: `useMenu` is `undefined` without it.
    addOptionalImports(nuxt, '#account/optional', [{
      name: 'useMenu',
      available: () => hasNuxtModule('@frigear-nu/menu', nuxt),
      fallback: 'undefined',
      fallbackType: 'undefined',
    }, {
      // `@frigear-nu/authorization` is optional: without it nothing can be checked, so permission-gated documents are hidden.
      name: 'useAuthorization',
      available: () => hasNuxtModule('@frigear-nu/authorization', nuxt),
      fallback: 'undefined',
      fallbackType: 'undefined',
    }])
    for (const document of settings.documents ?? []) {
      if ((document as { roles?: unknown }).roles !== undefined) {
        throw new Error(`[@frigear-nu/account] \`account.settings.documents[].roles\` was removed (document "${document.id}"): use \`permission\` (a \`resource:action\` string) instead.`)
      }
    }

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
    // No API tokens page when `@frigear-nu/auth` has user API tokens turned off (`authentication.apiTokens: false`).
    const withApiTokens = nuxt.options.authentication?.apiTokens !== false
    const apiTokensPath = withApiTokens ? resolvePagePath(settings.pages?.apiTokens, '/account/api-tokens') : undefined
    const indexPath = withMenus ? resolvePagePath(settings.pages?.index, '/account') : undefined

    if (!withApiTokens && settings.pages?.apiTokens) {
      console.warn('[@frigear-nu/account] `settings.pages.apiTokens` was set, but `authentication.apiTokens` is `false` - skipping the API tokens page.')
    }

    if (!withMenus && settings.pages?.index) {
      console.warn('[@frigear-nu/account] `settings.pages.index` was set, but `@frigear-nu/menu` is not installed - skipping the dashboard page.')
    }

    nuxt.options.runtimeConfig.public.account = {
      pages: { index: indexPath, profile: profilePath, security: securityPath, documents: documentsPath, apiTokens: apiTokensPath },
      documents: settings.documents ?? [],
      signedInApps: false,
    }
    // Known once every module is installed, whatever their order.
    nuxt.hook('modules:done', () => {
      nuxt.options.runtimeConfig.public.account!.signedInApps = hasNuxtModule('@frigear-nu/oauth-server', nuxt)
    })

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
      // An `account` layout of the app (`app/layouts/account.vue`) or a layer wins: Nuxt scans the layouts into
      // `app.layouts` before `app:resolve`, so ours only fills the gap, and the route rule below applies whichever it
      // is. Not `addLayout`: its `app:templates` hook runs again on every `updateTemplates()` in dev, where the scan is
      // cached, finds our own earlier entry and warns that `account` "is already provided by #build/account.vue".
      nuxt.hook('app:resolve', (app) => {
        app.layouts.account ||= { name: 'account', file: resolver.resolve('./runtime/app/layouts/account.vue') }
      })
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

    // One request for the user-scoped data modules show in the area (`registerBootstrapProvider` with
    // `scope: 'account'`), made by a route middleware on every account page. `#account/bootstrap` lists the keys, so
    // the middleware does nothing when no module registered one (the list is only known once every module is done).
    defineVirtualRegistry(nuxt, {
      filename: 'account/bootstrap.mjs',
      alias: '#account/bootstrap',
      collect: () => getBootstrapProviders(nuxt, 'account').map(provider => provider.key),
      contents: keys => `export const keys = ${JSON.stringify(keys)}\n`,
    })
    addTypeTemplate({
      filename: 'types/account-bootstrap.d.ts',
      getContents: () => `declare module '#account/bootstrap' {\n  export const keys: string[]\n}\nexport {}\n`,
    })
    addRouteMiddleware({ name: 'account-bootstrap', path: resolver.resolve('./runtime/app/middleware/bootstrap') })
    addPlugin({ src: resolver.resolve('./runtime/app/plugins/bootstrap.client'), mode: 'client' })
    const areaRules = nuxt.options.routeRules ||= {}
    for (const pattern of areaPatterns) {
      const rule = (areaRules[pattern] ?? {}) as { appMiddleware?: AppMiddlewareRule }
      areaRules[pattern] = { ...rule, appMiddleware: withAppMiddleware(rule.appMiddleware, 'account-bootstrap') } as (typeof areaRules)[string]
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })

    // Negative priority: a component with the same name in the app (or a layer) always wins over these defaults,
    // which is how a host overrides single parts (e.g. `AccountIdentity`) without replacing the rest.
    addComponentsDir({
      path: resolver.resolve('./runtime/app/components'),
      priority: -1,
    })
  },
})
