import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  useLogger,
} from '@nuxt/kit'
import {
  addModuleRoutes,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  registerBootstrapProvider,
} from '@frigear-nu/module-kit/utils'
import { adminRoute } from '@frigear-nu/admin/utils'
import { addAuthResolver, addPermission, addScope, isKnownScope, validateRoleScopes } from '@frigear-nu/auth/utils'
import { addMcpDefinitions } from '@frigear-nu/mcp/utils'
import { join, relative } from 'node:path'
import { oidc } from './runtime/utils/api'
import { OIDC_SCOPES, configuredClientWarnings, isExactOrigin, normalizeConfiguredClients, parseList, resolveRefreshTokenOptions, splitConfiguredScopes } from './runtime/utils'
import { loadOrCreateDevSigningKey } from './dev-key'
import type {
  ApplicationAccessContext,
  ClaimsContext,
  ModuleOptions,
  OAuthServerRuntimeConfig,
  PublicModuleOptions,
  TokenIssuedContext,
  TokenRevokedContext,
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

/**
 * `nuxt dev` without `NUXT_OAUTH_SERVER_PRIVATE_KEY`: a signing key generated once into `.data/oauth-server/dev-key.pem`,
 * so sign-in works out of the box. Never in a build: production keeps failing with `not_configured` until a key is set.
 */
function useDevSigningKey(rootDir: string): string | undefined {
  const logger = useLogger(MODULE_NAME)
  const path = join(rootDir, '.data', 'oauth-server', 'dev-key.pem')
  try {
    const { pem, created } = loadOrCreateDevSigningKey(path)
    logger.warn(`${created ? 'Generated' : 'Using'} a development signing key in ${relative(rootDir, path)}. Set NUXT_OAUTH_SERVER_PRIVATE_KEY before deploying.`)
    return pem
  }
  catch (error) {
    logger.warn(`No signing key configured and no development key could be written (${(error as Error).message}). Set NUXT_OAUTH_SERVER_PRIVATE_KEY.`)
    return undefined
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'oauthServer' },
  defaults: {
    keyId: 'key-1',
    accessTokenTtl: 900,
    // `refreshToken` has no default here: the deprecated `refreshTokenTtl` must still win over it (see below).
    revokeOnCredentialChange: true,
    codeTtl: 600,
    callbackPath: '/auth/frigear',
    scopes: [],
    cors: { origins: [], paths: [] },
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
    addPermission(nuxt,
      {
        name: 'oauth:read',
        label: 'See which applications you can sign in to',
        labelKey: 'oauthServer.permissions.read',
        group: 'oauth',
        // Self-service: every signed-in user sees their own applications.
        implicit: true,
      },
      {
        name: 'oauth:manage',
        label: 'Manage OAuth applications and scopes',
        labelKey: 'oauthServer.permissions.manage',
        group: 'oauth',
        // Client secrets and who may sign in where: a browser session only.
        sessionOnly: true,
        grantTo: ['admin'],
      },
    )
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
    // The scopes admin sits next to the applications admin (`<admin>/scopes`), unless placed elsewhere.
    const scopesPath = hasNuxtModule('@frigear-nu/admin')
      ? resolvePagePath(settings.pages?.scopes ?? (adminPath ? `${adminPath.replace(/\/+$/, '')}/scopes` : undefined), adminRoute(nuxt, 'oauth', 'scopes'))
      : undefined
    const applicationsPath = resolvePagePath(settings.pages?.applications, '/account/applications')

    const accessTokenTtl = options.accessTokenTtl ?? 900
    if (!Number.isSafeInteger(accessTokenTtl) || accessTokenTtl <= 0) {
      throw new Error(`[${MODULE_NAME}] accessTokenTtl must be a positive number of seconds, got "${accessTokenTtl}".`)
    }
    const accessTokenAudience = parseList(typeof options.accessTokenAudience === 'string' ? [options.accessTokenAudience] : options.accessTokenAudience)
    if (accessTokenAudience.length && accessTokenTtl > 900) {
      useLogger(MODULE_NAME).warn(`Access tokens for "${accessTokenAudience.join(', ')}" live ${accessTokenTtl}s; keep them at 5 to 15 minutes, other services cannot revoke them.`)
    }

    let refreshToken
    try {
      refreshToken = resolveRefreshTokenOptions(options)
    }
    catch (error) {
      throw new Error(`[${MODULE_NAME}] ${(error as Error).message}`, { cause: error })
    }
    if (options.refreshTokenTtl !== undefined && options.refreshToken?.idleTtl === undefined) {
      useLogger(MODULE_NAME).warn('`oauthServer.refreshTokenTtl` is deprecated: use `refreshToken: { idleTtl }`.')
    }

    const corsOrigins = (options.cors?.origins ?? []).map(origin => origin.trim()).filter(Boolean)
    for (const origin of corsOrigins) {
      // An origin is `scheme://host[:port]`. `capacitor://localhost` is one even though `URL.origin` calls it "null".
      if (!isExactOrigin(origin)) {
        throw new Error(`[${MODULE_NAME}] cors.origins must be exact origins such as "https://app.example.com" or "capacitor://localhost", got "${origin}".`)
      }
    }
    const corsPaths = parseList(options.cors?.paths)
    for (const path of corsPaths) {
      if (!path.startsWith('/') || path.startsWith('//')) throw new Error(`[${MODULE_NAME}] cors.paths must be path prefixes such as "/api/", got "${path}".`)
    }

    // Configured clients: validated now, and read at runtime, where `NUXT_OAUTH_SERVER_CLIENTS` may replace them (their
    // CORS origins are added there too, so a client removed by the override takes its origins with it).
    const callbackPath = options.callbackPath ?? '/auth/frigear'
    try {
      const clients = normalizeConfiguredClients(options.clients ?? [], { dev: nuxt.options.dev, callbackPath })
      for (const warning of configuredClientWarnings(clients, refreshToken)) useLogger(MODULE_NAME).warn(`oauthServer.clients: ${warning}`)
    }
    catch (error) {
      throw new Error(`[${MODULE_NAME}] oauthServer.clients: ${(error as Error).message}`, { cause: error })
    }

    // `scopes`: single words are named scopes (auth's `addScope`), permission names only describe a permission scope.
    let configuredScopes: ReturnType<typeof splitConfiguredScopes>
    try {
      configuredScopes = splitConfiguredScopes(options.scopes ?? [])
    }
    catch (error) {
      throw new Error(`[${MODULE_NAME}] oauthServer.scopes: ${(error as Error).message}`, { cause: error })
    }
    if (configuredScopes.named.length) {
      addScope(nuxt, ...configuredScopes.named.map(scope => ({
        name: scope.name,
        label: scope.label,
        labelKey: scope.labelKey,
        description: scope.description,
        icon: scope.icon,
        service: scope.service,
        permissions: scope.permissions ?? [],
      })))
    }
    const roleScopes = settings.roleScopes
    if (roleScopes !== undefined && (typeof roleScopes !== 'object' || roleScopes === null || Object.values(roleScopes).some(list => !Array.isArray(list) || list.some(item => typeof item !== 'string')))) {
      throw new Error(`[${MODULE_NAME}] settings.roleScopes must map role names to lists of scopes.`)
    }
    // Once access control compiled: `roleScopes` names configured roles, and described permission scopes exist.
    nuxt.hook('auth:access-compiled', (access) => {
      const errors = roleScopes ? validateRoleScopes(roleScopes, access.roles) : []
      for (const scope of configuredScopes.details) {
        if (!(OIDC_SCOPES as readonly string[]).includes(scope.name) && !isKnownScope(scope.name, access.registry, access.namedScopes)) {
          errors.push(`oauthServer.scopes describes "${scope.name}", which is no permission a token may hold: register it with addPermission (or authentication.permissions).`)
        }
      }
      if (!errors.length) return
      const message = `[${MODULE_NAME}] ${errors.join('\n- ')}`
      if (nuxt.options._prepare) useLogger(MODULE_NAME).warn(message)
      else throw new Error(message)
    })

    // `privateKey` / `publicKey` come from env (`NUXT_OAUTH_SERVER_PRIVATE_KEY` / `..._PUBLIC_KEY`).
    const existing = nuxt.options.runtimeConfig.oauthServer as Partial<OAuthServerRuntimeConfig> | undefined
    const devPrivateKey = nuxt.options.dev && !nuxt.options._prepare && !existing?.privateKey && !process.env.NUXT_OAUTH_SERVER_PRIVATE_KEY
      ? useDevSigningKey(nuxt.options.rootDir)
      : undefined
    nuxt.options.runtimeConfig.oauthServer = {
      privateKey: '',
      publicKey: '',
      previousPublicKeys: '',
      ...existing,
      ...(devPrivateKey ? { privateKey: devPrivateKey } : {}),
      // `''` rather than `undefined`: an undefined key is dropped from runtimeConfig, so `NUXT_OAUTH_SERVER_ISSUER` could not set it.
      issuer: options.issuer ?? '',
      keyId: options.keyId ?? 'key-1',
      accessTokenTtl,
      accessTokenAudience,
      refreshToken,
      revokeOnCredentialChange: options.revokeOnCredentialChange !== false,
      codeTtl: options.codeTtl ?? 600,
      callbackPath,
      // How the configured scopes are presented; the named ones are served by auth (`#auth/permissions`).
      scopeDetails: [...configuredScopes.named, ...configuredScopes.details],
      roleScopes: roleScopes ?? null,
      corsOrigins,
      corsPaths,
      clients: options.clients ?? [],
      authorizePath,
      signInPath: settings.signInPath,
    }
    nuxt.options.runtimeConfig.public.oauthServer = {
      pages: {
        authorize: settings.pages?.authorize === false ? undefined : authorizePath,
        admin: adminPath,
        scopes: scopesPath,
        applications: applicationsPath,
      },
    }

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- OAuth / OIDC endpoints (standard paths, absolute) -----------------------------------
    addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/middleware/oauth-cors') })
    addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/middleware/oauth-frame-protection') })
    addModuleRoutes(resolver, [
      { method: 'get', path: oidc.configuration, file: 'oidc/openid-configuration.get' },
      { method: 'get', path: oidc.jwks, file: 'oidc/jwks.get' },
      { method: 'get', path: oidc.authorize, file: 'oidc/authorize.get' },
      { method: 'post', path: oidc.authorize, file: 'oidc/authorize.post' },
      { method: 'post', path: oidc.token, file: 'oidc/token.post' },
      { method: 'post', path: oidc.revoke, file: 'oidc/revoke.post' },
      { method: 'get', path: oidc.userinfo, file: 'oidc/userinfo.get' },
      { method: 'post', path: oidc.introspect, file: 'oidc/introspect.post' },
    ], { base: '/' })

    // --- Module API: the consent data and the caller's own applications ---------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'consent', file: 'api/consent.get' },
      { method: 'get', path: 'me/applications', file: 'api/me-applications.get' },
      // The applications the caller is signed in to, one entry each (Signed-in apps on the account's Security page).
      { method: 'get', path: 'me/sessions', file: 'api/me-sessions.get' },
      { method: 'delete', path: 'me/sessions', file: 'api/me-sessions.delete' },
      { method: 'delete', path: 'me/sessions/:id', file: 'api/me-session.delete' },
    ], { base: '/api/oauth-server' })
    // The account area loads them together with the other modules' data (`useMyApplications()` reads the same key).
    registerBootstrapProvider(nuxt, {
      scope: 'account',
      key: 'oauth-server:mine',
      handler: resolver.resolve('./runtime/server/bootstrap/my-applications'),
    })

    // --- Staff API (the `oauth:manage` permission) -----------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'applications', file: 'api/admin/applications.get' },
      { method: 'post', path: 'applications', file: 'api/admin/applications.post' },
      { method: 'get', path: 'applications/:id', file: 'api/admin/application.get' },
      { method: 'patch', path: 'applications/:id', file: 'api/admin/application.patch' },
      { method: 'delete', path: 'applications/:id', file: 'api/admin/application.delete' },
      { method: 'post', path: 'applications/:id/secret', file: 'api/admin/application-secret.post' },
      { method: 'post', path: 'applications/:id/revoke', file: 'api/admin/application-revoke.post' },
      { method: 'get', path: 'scopes', file: 'api/admin/scopes.get' },
      { method: 'post', path: 'scopes', file: 'api/admin/scopes.post' },
      { method: 'get', path: 'scopes/:name', file: 'api/admin/scope.get' },
      { method: 'patch', path: 'scopes/:name', file: 'api/admin/scope.patch' },
      { method: 'delete', path: 'scopes/:name', file: 'api/admin/scope.delete' },
    ], { base: '/api/admin/oauth-server' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/credentials-changed'))
    inlineModuleRuntime(nuxt, resolver)
    if (settings.mcp === true) addMcpDefinitions(nuxt, resolver.resolve('./runtime/server/mcp'))

    // --- App runtime -----------------------------------------------------------------------
    addImports([
      { name: 'useOAuthApplications', from: resolver.resolve('./runtime/app/composables/useOAuthApplications') },
      { name: 'useMyApplications', from: resolver.resolve('./runtime/app/composables/useOAuthApplications') },
      { name: 'useOAuthApplicationActions', from: resolver.resolve('./runtime/app/composables/useOAuthApplicationActions') },
      { name: 'useOAuthScopes', from: resolver.resolve('./runtime/app/composables/useOAuthScopes') },
      { name: 'useOAuthScopeActions', from: resolver.resolve('./runtime/app/composables/useOAuthScopeActions') },
    ])

    addModulePages(MODULE_NAME, resolver, [
      { name: 'oauth-authorize', path: settings.pages?.authorize !== false ? authorizePath : undefined, file: './runtime/app/pages/authorize.vue' },
      { name: 'oauth-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'oauth-admin-scopes', path: scopesPath, file: './runtime/app/pages/scopes.vue' },
      { name: 'oauth-applications', path: applicationsPath, file: './runtime/app/pages/applications.vue' },
    ])

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })
  },
})
