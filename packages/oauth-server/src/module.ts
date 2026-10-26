import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  moduleApiUrl,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
} from '@frigear-nu/module-kit/utils'
import { adminRoute } from '@frigear-nu/admin/utils'
import { addAuthResolver, addAuthScope } from '@frigear-nu/auth/utils'
import { addMcpDefinitions } from '@frigear-nu/mcp/utils'
import type {
  ApplicationAccessContext,
  AuthorizeContext,
  ClaimsContext,
  ModuleOptions,
  OAuthServerRuntimeConfig,
  PublicModuleOptions,
  TokenIssuedContext,
  TokenRevokedContext,
  UserRolesContext,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    oauthServer?: ModuleOptions
  }

  interface RuntimeConfig {
    oauthServer: OAuthServerRuntimeConfig
  }

  interface PublicRuntimeConfig {
    oauthServer: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Admin gate (manage applications): set `ctx.allowed = true` to let the user in. Denied by default. */
    'oauth:authorize': (ctx: AuthorizeContext) => void | Promise<void>
    /** Push the user's roles onto `ctx.roles`. Without a listener nobody has a role. */
    'oauth:user:roles': (ctx: UserRolesContext) => void | Promise<void>
    /** Extra veto after the role check: set `ctx.allowed = false` (and `ctx.reason`) to deny. */
    'oauth:application:access': (ctx: ApplicationAccessContext) => void | Promise<void>
    /** Enrich ID tokens, access tokens and userinfo: mutate `ctx.claims`. */
    'oauth:claims': (ctx: ClaimsContext) => void | Promise<void>
    /** Tokens were issued (code exchange or refresh). Audit logging etc. */
    'oauth:token:issued': (ctx: TokenIssuedContext) => void | Promise<void>
    /** A refresh token (family) was revoked. */
    'oauth:token:revoked': (ctx: TokenRevokedContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/oauth-server'
const API_NAME = 'oauthServer'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'oauthServer' },
  defaults: {
    keyId: 'key-1',
    accessTokenTtl: 3600,
    refreshTokenTtl: 60 * 60 * 24 * 30,
    codeTtl: 600,
    callbackPath: '/auth/frigear',
    scopes: [],
    cors: { origins: [] },
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/mcp': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    // Provides the admin shell (layout, nav groups) the admin page lives in.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
  },
  setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    addAuthScope(nuxt, { name: 'oauth:read', description: 'See which applications you can sign in to (MCP)' })
    const resolver = createResolver(import.meta.url)

    // Access tokens of signed-in applications authenticate API calls as the user (see the resolver).
    addAuthResolver(nuxt, {
      name: 'oauth-access-token',
      jwt: true,
      order: 60,
      resolver: resolver.resolve('./runtime/server/resolvers/access-token'),
    })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    const settings = options.settings ?? {}

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    // The consent screen is part of the flow, so it is on unless explicitly disabled (`false`).
    const authorizePath = settings.pages?.authorize === false
      ? '/authorize'
      : resolvePagePath(settings.pages?.authorize ?? true, '/authorize')!
    // The admin page lives in the shell of `@frigear-nu/admin`, so it only exists with it.
    const adminPath = hasNuxtModule('@frigear-nu/admin') ? resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'oauth')) : undefined
    const applicationsPath = resolvePagePath(settings.pages?.applications, '/account/applications')

    const corsOrigins = (options.cors?.origins ?? []).map(origin => origin.trim()).filter(Boolean)
    for (const origin of corsOrigins) {
      // An origin is `scheme://host[:port]`. `capacitor://localhost` is one even though `URL.origin` calls it "null".
      const url = URL.canParse(origin) ? new URL(origin) : undefined
      if (!url || origin === '*' || origin !== `${url.protocol}//${url.host}`) {
        throw new Error(`[${MODULE_NAME}] cors.origins must be exact origins such as "https://app.example.com" or "capacitor://localhost", got "${origin}".`)
      }
    }

    // `privateKey` / `publicKey` come from env (`NUXT_OAUTH_SERVER_PRIVATE_KEY` / `..._PUBLIC_KEY`).
    const existing = nuxt.options.runtimeConfig.oauthServer as Partial<OAuthServerRuntimeConfig> | undefined
    nuxt.options.runtimeConfig.oauthServer = {
      privateKey: '',
      publicKey: '',
      previousPublicKeys: '',
      ...existing,
      issuer: options.issuer,
      keyId: options.keyId ?? 'key-1',
      accessTokenTtl: options.accessTokenTtl ?? 3600,
      refreshTokenTtl: options.refreshTokenTtl ?? 60 * 60 * 24 * 30,
      codeTtl: options.codeTtl ?? 600,
      callbackPath: options.callbackPath ?? '/auth/frigear',
      scopes: options.scopes ?? [],
      corsOrigins,
      authorizePath,
      signInPath: settings.signInPath,
    }
    nuxt.options.runtimeConfig.public.oauthServer = {
      pages: {
        authorize: settings.pages?.authorize === false ? undefined : authorizePath,
        admin: adminPath,
        applications: applicationsPath,
      },
    }

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- OAuth / OIDC endpoints (standard paths) -------------------------------------------
    addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/middleware/oauth-cors') })
    const handler = (file: string) => resolver.resolve(`./runtime/server/routes/${file}`)
    addServerHandler({ route: '/.well-known/openid-configuration', method: 'get', handler: handler('oidc/openid-configuration.get') })
    addServerHandler({ route: '/.well-known/jwks.json', method: 'get', handler: handler('oidc/jwks.get') })
    addServerHandler({ route: '/oauth/authorize', method: 'get', handler: handler('oidc/authorize.get') })
    addServerHandler({ route: '/oauth/authorize', method: 'post', handler: handler('oidc/authorize.post') })
    addServerHandler({ route: '/oauth/token', method: 'post', handler: handler('oidc/token.post') })
    addServerHandler({ route: '/oauth/revoke', method: 'post', handler: handler('oidc/revoke.post') })
    addServerHandler({ route: '/oauth/userinfo', method: 'get', handler: handler('oidc/userinfo.get') })

    // --- Module API ------------------------------------------------------------------------
    const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string, file: string) =>
      addServerHandler({ route: moduleApiUrl(API_NAME, path), method, handler: handler(file) })

    api('get', 'consent', 'api/consent.get')
    api('get', 'me/applications', 'api/me-applications.get')
    api('get', 'admin/applications', 'api/admin/applications.get')
    api('post', 'admin/applications', 'api/admin/applications.post')
    api('get', 'admin/applications/:id', 'api/admin/application.get')
    api('patch', 'admin/applications/:id', 'api/admin/application.patch')
    api('delete', 'admin/applications/:id', 'api/admin/application.delete')
    api('post', 'admin/applications/:id/secret', 'api/admin/application-secret.post')
    api('post', 'admin/applications/:id/revoke', 'api/admin/application-revoke.post')

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    if (settings.mcp === true) addMcpDefinitions(nuxt, resolver.resolve('./runtime/server/mcp'))

    // --- App runtime -----------------------------------------------------------------------
    addImports([
      { name: 'useOAuthApplications', from: resolver.resolve('./runtime/app/composables/useOAuthApplications') },
      { name: 'useMyApplications', from: resolver.resolve('./runtime/app/composables/useOAuthApplications') },
      { name: 'useOAuthApplicationActions', from: resolver.resolve('./runtime/app/composables/useOAuthApplicationActions') },
    ])

    addModulePages(MODULE_NAME, resolver, [
      { name: 'oauth-authorize', path: settings.pages?.authorize !== false ? authorizePath : undefined, file: './runtime/app/pages/authorize.vue' },
      { name: 'oauth-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'oauth-applications', path: applicationsPath, file: './runtime/app/pages/applications.vue' },
    ])

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })
  },
})
