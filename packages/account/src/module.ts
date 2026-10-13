import {
  addComponentsDir,
  addImports,
  addServerHandler,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import { registerModule, registerLocales, registerTailwindSource, resolvePagePath, addOptionalMenuSource } from '@frigear-nu/module-kit/utils'
import type { NuxtPage } from '@nuxt/schema'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type { ModuleOptions, PublicModuleOptions } from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    account?: ModuleOptions
  }

  interface RuntimeConfig {
    account?: { idCode?: { privateKey?: string, keyId?: string, issuer?: string } }
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
    '@frigear-nu/menu': {
      version: '>=0.0.1',
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

    addServerHandler({
      route: '/api/account/id-code',
      method: 'get',
      handler: resolver.resolve('./runtime/server/routes/account/id-code.get'),
    })

    // The Frigear ID QR is signed with `runtimeConfig.account.idCode.privateKey` (NUXT_ACCOUNT_ID_CODE_PRIVATE_KEY) or,
    // when unset, the RS256 key of `@frigear-nu/oauth-server` (`runtimeConfig.oauthServer`), which publishes the JWKS.
    const existingAccount = nuxt.options.runtimeConfig.account as { idCode?: object } | undefined
    nuxt.options.runtimeConfig.account = {
      idCode: { privateKey: '', keyId: '', issuer: '', ...existingAccount?.idCode },
    }

    addImports([{ name: 'useAccount', from: resolver.resolve('./runtime/app/composables/useAccount') }])

    // Profile/security pages are opt-in (`settings.pages.profile`/`settings.pages.security`)
    // rather than enabled by default, since they require `@nuxt/ui` to be installed in the
    // consuming app. The dashboard/index page additionally requires `@frigear-nu/menu`,
    // since it only lists the tiles contributed through that module.
    const profilePath = resolvePagePath(settings.pages?.profile, '/account/profile')
    const securityPath = resolvePagePath(settings.pages?.security, '/account/security')
    const documentsPath = resolvePagePath(settings.pages?.documents, '/account/documents')
    const idCodePath = resolvePagePath(settings.pages?.idCode, '/account/id')
    const apiTokensPath = resolvePagePath(settings.pages?.apiTokens, '/account/api-tokens')
    const indexPath = withMenus ? resolvePagePath(settings.pages?.index, '/account') : undefined

    if (!withMenus && settings.pages?.index) {
      console.warn('[@frigear-nu/account] `settings.pages.index` was set, but `@frigear-nu/menu` is not installed - skipping the dashboard page.')
    }

    nuxt.options.runtimeConfig.public.account = {
      pages: { index: indexPath, profile: profilePath, security: securityPath, documents: documentsPath, idCode: idCodePath, apiTokens: apiTokensPath },
      documents: settings.documents ?? [],
    }

    if (indexPath || profilePath || securityPath || documentsPath || idCodePath || apiTokensPath) {
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))

        const children: NuxtPage[] = []
        const add = (path: string | undefined, name: string, file: string) => {
          if (path && !existingPaths.has(path)) children.push({ name, path, file: resolver.resolve(file) })
        }
        add(indexPath, 'account-index', './runtime/app/pages/index.vue')
        add(profilePath, 'account-profile', './runtime/app/pages/profile.vue')
        add(documentsPath, 'account-documents', './runtime/app/pages/documents.vue')
        add(securityPath, 'account-security', './runtime/app/pages/security.vue')
        add(idCodePath, 'account-id-code', './runtime/app/pages/id-code.vue')
        add(apiTokensPath, 'account-api-tokens', './runtime/app/pages/api-tokens.vue')

        // All account pages share one parent route that renders the account header above them.
        if (children.length) {
          pages.push({ name: 'account-layout', path: '/__account', file: resolver.resolve('./runtime/app/pages/layout.vue'), children })
        }
      })
    }

    // Everything under /account is for signed-in users only, including the pages other modules add there
    // (membership, tickets, applications). Route rules are enforced by @frigear-nu/authorization (also on the
    // server); with @nuxtjs/i18n every page also exists under `/<locale>/...`, so rules apply to each prefix.
    if (hasNuxtModule('@frigear-nu/authorization')) {
      const prefixes = ['', ...(nuxt.options.i18n?.locales ?? [])
        .map(locale => typeof locale === 'string' ? locale : locale.code)
        .map(code => `/${code}`)]
      const rules = nuxt.options.routeRules ||= {}
      const guarded = [indexPath, profilePath, securityPath, documentsPath, idCodePath, apiTokensPath]
        .filter((path): path is string => !!path && !path.startsWith('/account'))
      for (const prefix of prefixes) {
        for (const pattern of [`${prefix}/account`, `${prefix}/account/**`, ...guarded.map(path => `${prefix}${path}`)]) {
          rules[pattern] = { authenticated: true, ...rules[pattern] } as (typeof rules)[string]
        }
      }
    }
    else {
      console.warn('[@frigear-nu/account] @frigear-nu/authorization is not installed: the account pages are not guarded. Install it and guard `/account/**` yourself.')
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })

    addComponentsDir({
      path: resolver.resolve('./runtime/app/components'),
    })
  },
})
