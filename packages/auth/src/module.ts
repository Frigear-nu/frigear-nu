import {
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  addTemplate,
  addServerImportsDir,
  addServerPlugin,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  tryResolveModule,
  useLogger,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import {
  extendDatabaseTable,
  addModuleRoutes,
  registerDatabaseTable,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  defineBootstrapRegistry,
  addOptionalImports,
  defineVirtualRegistry,
} from '@frigear-nu/module-kit/utils'
import type { ModuleRoute } from '@frigear-nu/module-kit/utils'
import type { Nitro } from 'nitropack'
import { lowerFirst } from 'scule'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AuthResolverDefinition,
  AuthSettings,
  AuthScopeAvailabilityContext,
  AuthScopeDefinition,
  ModuleOptions,
  OAuthProvider,
  PublicModuleOptions,
} from './types'
import type { AuthUserStoreRegistration } from './runtime/utils/build'
import { USER_TOKEN_PREFIX } from './runtime/utils/tokens'
import type { AuthEmailContext } from './runtime/server/utils/auth-email'
import type { AuthCredentialsChangedContext } from './runtime/server/utils/credentials'
import type { AuthAppConfig, AuthClientPublicConfig } from './runtime/client/types'
import { resolveAuthMode } from './runtime/mode'
import type { AuthMode } from './runtime/mode'
import { isSafeRedirect } from './runtime/utils/redirect'
import {
  assertNoClientSecretInBundle,
  checkNativeStorage,
  clientPublicPaths,
  findGuardRules,
  isPackageInstalled,
  mergeClientPublicConfig,
  nativeLoaderTemplate,
  parseStorageOption,
  resolveNativeRedirectUri,
  SECRET_ENV_NAMES,
} from './client-build'

export type {
  AuthAppConfig,
  AuthClientPublicConfig,
  AuthMode,
  AuthStatus,
  ClientModuleOptions,
  AuthCreatedTokenDto,
  AuthPasskeyDto,
  AuthResolverDefinition,
  AuthScopeAvailabilityContext,
  AuthScopeDefinition,
  AuthSettings,
  AuthTokenDto,
  ModuleOptions,
  OAuthProvider,
  OAuthProviderButton,
  OAuthProviderOptions,
  PublicModuleOptions,
} from './types'
export type { AuthCredentialsChangedContext, AuthCredentialsChangeReason } from './runtime/server/utils/credentials'

// Only same-site paths are followed after sign in (`isSafeRedirect`, as on the server).
function resolveAfterLogin(path: string | undefined) {
  return isSafeRedirect(path) ? path : '/'
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    authentication?: ModuleOptions
  }

  interface RuntimeConfig {
    authentication?: {
      tokenTtlDays: number | null
      apiTokenPrefix: string
      // Revoke a user's API tokens on a password reset or a reverted email change (`apiTokens.revokeOnReset`).
      revokeTokensOnReset: boolean
      magicLinkSignUp: boolean
      magicLinkCooldown: number
      // Build emailed links from the request origin when no site URL is set (`settings.trustRequestOrigin`).
      trustRequestOrigin: boolean
      // Minimum seconds between two password reset emails for one user (`settings.passwordReset.cooldown`).
      passwordResetCooldown: number
      // Throttling of the sign-in routes (`settings.rateLimit`); `enabled` is false under `nuxt dev`.
      rateLimit: { enabled: boolean, windowSeconds: number, login: number, loginIp: number, requests: number, ipHeader: string, xForwardedFor: boolean }
    }
    // Encrypts kept OAuth tokens (`NUXT_AUTH_TOKENS_KEY`); falls back to a key derived from the session password.
    authTokensKey?: string
    // Set by the host (e.g. from the CI preview marker). Enables "Log in with frigear.nu" without `frigear.sso`.
    previewDeployment?: boolean
    frigear?: {
      // frigear.nu is used as the identity provider when `url`, `clientId` and `clientSecret` are set.
      // `scopes`: what the login asks for (space separated, default `openid profile email`). `stepUpScopes`: extra scopes
      // a login may add with `/auth/frigear?scope=...` (space separated allowlist, default none).
      sso?: { url?: string, clientId?: string, clientSecret?: string, scopes?: string, stepUpScopes?: string }
      // Use the frigear.nu user id as the local `users.id` (existing users matched by email are re-keyed).
      forceId?: boolean
      // Apply the role claim of frigear.nu to the local user at every login, through `roleMap`. Only on when `roleMap`
      // maps a role; `false` turns it off.
      syncRole?: boolean
      // frigear.nu role -> local role (`NUXT_FRIGEAR_ROLE_MAP`, JSON). A missing or unlisted role becomes `defaultRole`.
      roleMap?: Record<string, string> | string
      // The role of a user whose claim is missing or not in `roleMap`. Defaults to `user`.
      defaultRole?: string
      // Keep the frigear.nu tokens in `auth_oauth_tokens` (`getOAuthAccessToken`). Defaults to `oauth.frigear.keepTokens`.
      keepTokens?: boolean
    }
  }

  interface PublicRuntimeConfig {
    authentication?: PublicModuleOptions
    // The public URL of the site (`NUXT_PUBLIC_SITE_URL`); emailed links point here (`authSiteOrigin`).
    siteUrl?: string
  }

  interface AppConfigInput {
    authentication?: AuthAppConfig
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Decides per user whether a registered scope may be picked for a token: set `ctx.available = false` to hide it. */
    'auth:scope-available': (ctx: AuthScopeAvailabilityContext) => void | Promise<void>
    /** An auth email (magic link, email verification) is about to be sent; replace `ctx.notification`'s subject/body to brand it. */
    'auth:email': (ctx: AuthEmailContext) => void | Promise<void>
    /**
     * A user's password was changed or reset, or their email changed (`notifyAuthCredentialsChanged`). Fired after the
     * change is stored, and after the user's other cookie sessions were ended; end other sessions the old credentials
     * opened here.
     */
    'auth:credentials:changed': (ctx: AuthCredentialsChangedContext) => void | Promise<void>
  }
}

const isExternalUrl = (value: string | undefined) => !!value && /^https?:\/\//.test(value)

const MODULE_NAME = '@frigear-nu/auth'

// The mode `moduleDependencies` picked the modules for, before Nuxt merged other modules' defaults into the options.
const dependencyModes = new WeakMap<Nuxt, AuthMode>()

// Server mode needs NuxtHub (an optional peer, since client mode does not): say so before Nuxt fails to load it.
async function assertNuxtHubInstalled(nuxt: Nuxt) {
  // Resolved the way Nuxt resolves module dependencies: from the app, its modules dirs, and Auth itself.
  const from = [nuxt.options.rootDir, ...nuxt.options.modulesDir].map(dir => pathToFileURL(`${dir.replace(/\/$/, '')}/`).href)
  from.push(import.meta.url)
  if (await tryResolveModule('@nuxthub/core', from)) return
  throw new Error(`[${MODULE_NAME}] Server mode needs \`@nuxthub/core\` (the database): install it, or set \`authentication.mode: 'client'\` for an app without a server.`)
}

export default defineNuxtModule<ModuleOptions>({
  // Not `auth`: that key belongs to nuxt-auth-utils.
  meta: { name: MODULE_NAME, configKey: 'authentication' },
  defaults: {
    tokenTtlDays: null,
    settings: {
      password: true,
      webAuthn: false,
      pages: {},
    },
  },
  // The mode comes from the app's own config only (`resolveAuthMode`): client mode needs no server modules.
  moduleDependencies: async (nuxt) => {
    const mode = resolveAuthMode(nuxt)
    dependencyModes.set(nuxt, mode)
    if (mode === 'client') return { '@frigear-nu/module-kit': { version: '>=0.0.1' } }
    if (!nuxt.options._prepare) await assertNuxtHubInstalled(nuxt)
    return serverDependencies(nuxt)
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const mode = dependencyModes.get(nuxt) ?? resolveAuthMode(nuxt)
    if ((options.mode ?? 'server') !== mode) {
      throw new Error(`[${MODULE_NAME}] \`authentication.mode\` ${JSON.stringify(options.mode)} did not come from the app's config: set it under the \`authentication\` key of nuxt.config, not as inline module options or another module's default, so every module sees the same mode.`)
    }
    if (mode === 'client') return setupClientMode(options, nuxt, resolver)
    return setupServerMode(options, nuxt, resolver)
  },
})

const serverDependencies = (nuxt: Nuxt) => ({
  '@nuxthub/core': {
    version: '>=0.0.1',
  },
  '@frigear-nu/module-kit': {
    version: '>=0.0.1',
  },
  '@frigear-nu/notify': {
    version: '>=0.0.1',
  },
  '@frigear-nu/menu': {
    version: '>=0.0.1',
    optional: true,
  },
  'nuxt-auth-utils': {
    version: '>=0.0.1',
    // Only when passkeys are on: nuxt-auth-utils imports `@simplewebauthn/server` at setup to check it is
    // installed, which costs seconds on a cold boot.
    defaults: { webAuthn: nuxt.options.authentication?.settings?.webAuthn === true },
  },
})

const hasHubKv = (nuxt: Nuxt) => !!(nuxt.options as { hub?: { kv?: unknown } }).hub?.kv

// Defaults of `settings.rateLimit`; `0` turns one limit off, `false` all of them. Off under `nuxt dev`.
function resolveRateLimit(option: AuthSettings['rateLimit'], dev: boolean) {
  const limits = typeof option === 'object' ? option : {}
  return {
    enabled: option !== false && !dev,
    windowSeconds: limits.windowSeconds ?? 900,
    login: limits.login ?? 10,
    loginIp: limits.loginIp ?? 100,
    requests: limits.requests ?? 30,
    ipHeader: limits.ipHeader ?? '',
    xForwardedFor: limits.xForwardedFor === true,
  }
}

/** How long a cookie session lasts by default, in seconds (`settings.session.maxAge`): 30 days. */
const DEFAULT_SESSION_MAX_AGE = 30 * 24 * 60 * 60

// Today's Auth: sign-in on this app's server, a nuxt-auth-utils cookie session, the database tables and routes.
function setupServerMode(options: ModuleOptions, nuxt: Nuxt, resolver: ReturnType<typeof createResolver>) {
  const settings = options.settings ?? {}
  const withPassword = settings.password !== false
  const withPasswordReset = withPassword && settings.passwordReset !== false
  const withWebAuthn = settings.webAuthn === true
  // nuxt-auth-utils only auto-imports `useWebAuthn` with passkeys on; callers check `webAuthn` first.
  addOptionalImports(nuxt, '#auth/webauthn', [{
    name: 'useWebAuthn',
    available: () => withWebAuthn,
    fallback: `() => { throw new Error('[@frigear-nu/auth] Passkeys are off (\`authentication.settings.webAuthn\`)') }`,
    fallbackType: '(...args: unknown[]) => never',
  }])
  const withMagicLink = !!settings.magicLink
  const withVerifyEmail = withPassword && settings.verifyEmail === true
  // Providers listed in settings; the others turn on through their nuxt-auth-utils env vars (`#auth/oauth` below).
  const oauthSettings = settings.oauth ?? {}
  const oauthProviders: OAuthProvider[] = Object.keys(oauthSettings).filter(provider => oauthSettings[provider] !== false)
  const withApiTokens = options.apiTokens !== false
  const apiTokenPrefix = (typeof options.apiTokens === 'object' ? options.apiTokens.prefix : undefined) ?? USER_TOKEN_PREFIX
  // No `.`, so a user token can never be mistaken for a JWT.
  if (!/^[\w-]+$/.test(apiTokenPrefix)) {
    throw new Error(`[@frigear-nu/auth] \`apiTokens.prefix\` must be letters, digits, \`_\` or \`-\`, got ${JSON.stringify(apiTokenPrefix)}.`)
  }
  if (!withWebAuthn) {
    nuxt.options.auth ||= {}
    nuxt.options.auth.webAuthn = false
  }
  else {
    // `@simplewebauthn/server` 13 loads `@peculiar/x509`, whose tsyringe throws at import without the
    // `reflect-metadata` polyfill. x509 imports it for its side effect only, and Nitro tree-shakes side effects of
    // modules not listed in `moduleSideEffects`, so the server bundle would crash on startup (Cloudflare Workers).
    nuxt.options.nitro.moduleSideEffects ||= []
    if (!nuxt.options.nitro.moduleSideEffects.includes('reflect-metadata/')) {
      nuxt.options.nitro.moduleSideEffects.push('reflect-metadata/')
    }
  }

  // Each table exists only when the feature owning it is enabled. Verification emails are magic links too.
  const tables = ['authUserTokens']
  if (withWebAuthn) tables.push('userCredentials')
  if (withPasswordReset) tables.push('passwordResets')
  if (withMagicLink || withVerifyEmail) tables.push('magicLinks')
  // OAuth tokens are kept only for providers that ask for it (`oauth.<provider>.keepTokens`).
  const keepsTokens = (provider: string) => {
    const providerOptions = oauthSettings[provider]
    return typeof providerOptions === 'object' && providerOptions.keepTokens === true
  }
  const keepsOAuthTokens = oauthProviders.some(keepsTokens)
  if (keepsOAuthTokens) tables.push('authOAuthTokens')

  registerDatabaseTable(nuxt, {
    name: tables,
    resolver,
    schema: dialect => `./runtime/db/schema.${dialect}`,
  })

  // Credential columns on the `users` table owned by `@frigear-nu/users` (ignored when that module is absent).
  extendDatabaseTable(nuxt, {
    resolver,
    file: dialect => `./runtime/db/users.${dialect}`,
  })

  // Cookie sessions end `maxAge` seconds after they were last sealed (sign-in, or any later write to the session): the
  // cookie gets that `Max-Age` and an older seal is refused. The host's own `runtimeConfig.session.maxAge` wins;
  // nuxt-auth-utils merges its defaults over what is set here.
  const withSession = nuxt.options.runtimeConfig as { session?: { maxAge?: number, password?: string } }
  const sessionConfig = withSession.session ??= {}
  sessionConfig.maxAge ??= settings.session?.maxAge === false ? 0 : (settings.session?.maxAge ?? DEFAULT_SESSION_MAX_AGE)
  // nuxt-auth-utils 0.6 seals sessions with `appSecret` and no longer declares `session.password`. Kept OAuth tokens
  // still fall back to it, and Nuxt only lets `NUXT_SESSION_PASSWORD` override a key declared at build time.
  sessionConfig.password ??= ''

  const magicLinkSettings = typeof settings.magicLink === 'object' ? settings.magicLink : {}
  nuxt.options.runtimeConfig.authentication = {
    tokenTtlDays: options.tokenTtlDays ?? null,
    apiTokenPrefix,
    revokeTokensOnReset: (typeof options.apiTokens === 'object' ? options.apiTokens.revokeOnReset : undefined) !== false,
    magicLinkSignUp: magicLinkSettings.signUp === true,
    magicLinkCooldown: magicLinkSettings.cooldown ?? 60,
    trustRequestOrigin: settings.trustRequestOrigin === true,
    passwordResetCooldown: (typeof settings.passwordReset === 'object' ? settings.passwordReset.cooldown : undefined) ?? 60,
    rateLimit: resolveRateLimit(settings.rateLimit, nuxt.options.dev),
  }
  // The limits count in KV (NuxtHub `hub.kv`); without it they are off, which the host should know about.
  addServerTemplate({
    filename: '#auth/rate-limit-kv',
    getContents: () => hasHubKv(nuxt) ? `export { kv } from '@nuxthub/kv'` : 'export const kv = undefined',
  })
  nuxt.hook('modules:done', () => {
    if (settings.rateLimit !== false && !nuxt.options.dev && !nuxt.options._prepare && !hasHubKv(nuxt)) {
      useLogger('auth').warn('Sign-in throttling (`authentication.settings.rateLimit`) needs NuxtHub KV: set `hub.kv` to turn it on, or `rateLimit: false` to silence this.')
    }
  })
  // Where emailed links point (`authSiteOrigin`); `NUXT_PUBLIC_SITE_URL` sets it at runtime.
  const publicConfig = nuxt.options.runtimeConfig.public as { siteUrl?: string }
  publicConfig.siteUrl ||= settings.siteUrl || process.env.NUXT_SITE_URL || ''
  addServerPlugin(resolver.resolve('./runtime/server/plugins/site-url'))
  // `/api/_auth/session` answers the user as `getAuth` sees them: fresh from the store, or signed out.
  addServerPlugin(resolver.resolve('./runtime/server/plugins/session-fetch'))

  // Bearer resolvers: the built-in user-token one plus whatever other modules register.
  addServerTemplate({
    filename: '#auth/resolvers',
    getContents: async () => {
      const registered: AuthResolverDefinition[] = withApiTokens
        ? [{
            name: 'user-token',
            prefix: apiTokenPrefix,
            order: 50,
            resolver: resolver.resolve('./runtime/server/resolvers/user-token'),
          }]
        : []
      await nuxt.callHook('auth:resolvers', registered)
      return [
        ...registered.map((definition, index) => `import resolve${index} from ${JSON.stringify(definition.resolver)}`),
        `export const resolvers = [${registered.map((definition, index) => `{ name: ${JSON.stringify(definition.name)}, prefix: ${JSON.stringify(definition.prefix)}, jwt: ${definition.jwt === true}, order: ${definition.order ?? 100}, resolve: resolve${index} }`).join(', ')}]`,
      ].join('\n')
    },
  })

  // Scopes user tokens can be granted: the host's plus those modules declare.
  addServerTemplate({
    filename: '#auth/scopes',
    getContents: async () => {
      const registered: AuthScopeDefinition[] = [...(options.scopes ?? [])]
      await nuxt.callHook('auth:scopes', registered)
      const unique = [...new Map(registered.map(scope => [scope.name, scope])).values()]
      return `export const scopes = ${JSON.stringify(unique)}`
    },
  })

  // Where users are read and written (provided by `@frigear-nu/users`, overridable by the host).
  addServerTemplate({
    filename: '#auth/user-store',
    getContents: async () => {
      const registration: AuthUserStoreRegistration = {}
      await nuxt.callHook('auth:user-store', registration)
      const path = options.userStore
        ? await resolver.resolvePath(options.userStore, { cwd: nuxt.options.rootDir })
        : registration.path
      // `configured`: without a store there is nothing to check a session against, so `getAuth` keeps its snapshot.
      if (path) return `export { default } from ${JSON.stringify(path)}\nexport const configured = true`
      const missing = `() => { throw new Error('[auth] No user store: install @frigear-nu/users or set authentication.userStore.') }`
      return `export default { findById: async () => null, findByEmail: async () => null, create: ${missing}, update: ${missing}, remove: ${missing}, changeId: ${missing} }\nexport const configured = false`
    },
  })

  // Session enrichment: re-exports the host's mapper (or a pass-through default) so routes can import it statically.
  addServerTemplate({
    filename: '#auth/session-mapper',
    getContents: async () => {
      if (!settings.session?.mapper) return 'export default (user) => user'
      const mapperPath = await resolver.resolvePath(settings.session.mapper, { cwd: nuxt.options.rootDir })
      return `export { default } from ${JSON.stringify(mapperPath)}`
    },
  })

  addTypeTemplate({
    filename: 'types/auth-virtual.d.ts',
    getContents: () => `declare module '#auth/resolvers' {
  export const resolvers: Array<{
    name: string
    prefix?: string
    jwt?: boolean
    order?: number
    resolve: import('${resolver.resolve('./types')}').AuthResolverFn
  }>
}
declare module '#auth/scopes' {
  export const scopes: Array<{ name: string, description?: string, roles?: string[] }>
}
declare module '#auth/user-store' {
  const store: import('${resolver.resolve('./runtime/types')}').AuthUserStore
  export default store
  /** \`false\` when no store is registered (neither \`@frigear-nu/users\` nor \`authentication.userStore\`). */
  export const configured: boolean
}
declare module '#auth/rate-limit-kv' {
  export const kv: {
    get<T>(key: string): Promise<T | null>
    set(key: string, value: unknown, options?: { ttl?: number }): Promise<void>
  } | undefined
}
declare module '#auth/session-mapper' {
  const mapSessionUser: (user: Record<string, unknown>) => Record<string, unknown>
  export default mapSessionUser
}
declare module '#auth/oauth' {
  type OAuthHandlerOptions = {
    config?: Record<string, unknown>
    onSuccess: (event: import('h3').H3Event, result: { user: Record<string, unknown> }) => unknown
  }
  export const handlers: Record<string, () => Promise<(options: OAuthHandlerOptions) => import('h3').EventHandler>>
  export const settings: Record<string, false | import('${resolver.resolve('./types')}').OAuthProviderOptions>
}
export {}
`,
  }, { nitro: true, nuxt: true })

  // OAuth sign-in reuses nuxt-auth-utils' handlers: each `defineOAuth<Provider>EventHandler` it auto-imports is a
  // provider here, loaded on first use and keyed like its `runtimeConfig.oauth` block, so its env vars turn it on.
  let nitroInstance: Nitro | undefined
  nuxt.hook('nitro:init', (nitro) => {
    nitroInstance = nitro
  })
  addServerTemplate({
    filename: '#auth/oauth',
    getContents: async () => {
      const configKeys = Object.keys((nuxt.options.runtimeConfig as { oauth?: Record<string, unknown> }).oauth ?? {})
      const keyOf = (name: string) => configKeys.find(key => key.toLowerCase() === name.toLowerCase()) ?? lowerFirst(name)
      const handlers = (await nitroInstance?.unimport?.getImports() ?? []).flatMap(({ name, as, from }) => {
        const provider = /^defineOAuth(\w+)EventHandler$/.exec(as ?? name)?.[1]
        return provider ? [`${JSON.stringify(keyOf(provider))}: () => import(${JSON.stringify(from)}).then(m => m[${JSON.stringify(name)}])`] : []
      })
      const providerSettings = Object.fromEntries(Object.entries(oauthSettings)
        .map(([provider, value]) => [keyOf(provider), value === true ? {} : value]))
      return [
        `export const handlers = { ${handlers.join(', ')} }`,
        `export const settings = ${JSON.stringify(providerSettings)}`,
      ].join('\n')
    },
  })

  // The emails this module sends, as templates @frigear-nu/email-templates renders when installed.
  nuxt.hook('notify:email:templates', sources => sources.push({ dir: resolver.resolve('./runtime/emails') }))
  addServerImportsDir(resolver.resolve('./runtime/server/utils'))
  inlineModuleRuntime(nuxt, resolver)

  addServerHandler({
    middleware: true,
    handler: resolver.resolve('./runtime/server/middleware/auth'),
  })

  // One request for an area's user-scoped data (`GET /api/auth/bootstrap?scope=account`): it authenticates once
  // and runs every provider modules registered with `registerBootstrapProvider` for that scope.
  defineBootstrapRegistry(nuxt)

  // Every route of the module, read off one table (paths relative to `/api/auth`; `authApi` in
  // `runtime/utils/api.ts` builds them for clients). The h3 router prefers static segments, so the static
  // `/api/auth/*` routes win over `:provider` whatever their order; `:provider` is still listed last.
  const routes: ModuleRoute[] = [
    { method: 'post', path: 'logout', file: 'session/logout.post' },
    { method: 'get', path: 'bootstrap', file: 'bootstrap.get' },
    { method: 'get', path: 'scopes', file: 'scopes.get' },
  ]
  // The `authUserTokens` table stays registered when tokens are off: removing a user still clears its rows.
  if (withApiTokens) {
    routes.push(
      { method: 'get', path: 'me/tokens', file: 'me/tokens.get' },
      { method: 'post', path: 'me/tokens', file: 'me/tokens.post' },
      { method: 'delete', path: 'me/tokens/:id', file: 'me/token.delete' },
    )
  }
  if (withPassword) {
    routes.push(
      { method: 'post', path: 'login', file: 'session/login.post' },
      { method: 'post', path: 'register', file: 'session/register.post' },
    )
  }
  if (withPasswordReset) {
    routes.push(
      { method: 'post', path: 'forgot-password', file: 'session/forgot-password.post' },
      { method: 'post', path: 'reset-password', file: 'session/reset-password.post' },
    )
  }
  // The emailed link opens the `/auth/magic-link` page (below); its button signs in through this POST, so a GET
  // (a mail scanner, a link preview) never uses a link up.
  if (withMagicLink || withVerifyEmail) routes.push({ method: 'post', path: 'magic-link/confirm', file: 'session/magic-link-confirm.post' })
  if (withMagicLink) routes.push({ method: 'post', path: 'magic-link', file: 'session/magic-link.post' })
  if (withWebAuthn) {
    routes.push(
      { method: 'post', path: 'webauthn/register', file: 'webauthn/register.post' },
      { method: 'post', path: 'webauthn/authenticate', file: 'webauthn/authenticate.post' },
      { method: 'get', path: 'me/passkeys', file: 'me/passkeys.get' },
      { method: 'delete', path: 'me/passkeys/:id', file: 'me/passkey.delete' },
    )
  }
  routes.push({ method: 'get', path: 'providers', file: 'oauth/providers.get' })
  // The IdP redirects the browser back to `/auth/frigear` (its registered redirect URI, a navigation), so it is
  // not under `/api` and never moves.
  if (oauthProviders.includes('frigear')) {
    routes.push(
      { method: 'get', path: '/auth/frigear', file: 'oauth/frigear.get' },
      { method: 'get', path: 'frigear-status', file: 'oauth/frigear-status.get' },
    )
  }
  // Every nuxt-auth-utils provider, answering 404 until it is configured (decided per request, credentials are
  // runtime secrets). It is also each provider's registered callback URL, so the path never moves.
  routes.push({ method: 'get', path: ':provider', file: 'oauth/provider.get' })
  addModuleRoutes(resolver, routes, { base: '/api/auth' })

  addImports([
    'useLogin',
    'useMagicLink',
    'usePasskeys',
    'usePasswordReset',
    'useRegistration',
    'useAuthPages',
    'useAfterLogin',
    // The client API both modes share (client mode registers its own).
    'useAuth',
    'useApi',
  ].map(name => ({ name, from: resolver.resolve(`./runtime/app/composables/${name}`) })))
  addPlugin(resolver.resolve('./runtime/app/plugins/api'))

  // Login/register pages are opt-in (`settings.pages.login`/`settings.pages.register`) rather than enabled by
  // default, since they require `@nuxt/ui` to be installed in the consuming app.
  const loginPath = withPassword || oauthProviders.length > 0
    ? resolvePagePath(settings.pages?.login, '/login')
    : undefined
  const registerPath = withPassword ? resolvePagePath(settings.pages?.register, '/register') : undefined
  // An absolute register URL only feeds the login page link; there is no local page to register.
  const localRegisterPath = isExternalUrl(registerPath) ? undefined : registerPath

  addModulePages('@frigear-nu/auth', resolver, [
    { name: 'auth-login', path: loginPath, file: './runtime/app/pages/login.vue' },
    { name: 'auth-register', path: localRegisterPath, file: './runtime/app/pages/register.vue' },
    // The reset link emailed by `/api/auth/forgot-password` points at `/reset-password`.
    { name: 'auth-forgot-password', path: loginPath && withPasswordReset ? '/forgot-password' : undefined, file: './runtime/app/pages/forgot-password.vue' },
    { name: 'auth-reset-password', path: loginPath && withPasswordReset ? '/reset-password' : undefined, file: './runtime/app/pages/reset-password.vue' },
  ])

  // Pages that emailed links open (the magic link here, the email change pages of `@frigear-nu/users`) need
  // `@nuxt/ui`, which may be installed by another module, so this is decided once every module is set up.
  nuxt.hook('modules:done', () => {
    const withUi = hasNuxtModule('@nuxt/ui', nuxt)
    if (loginPath || localRegisterPath || withUi) {
      addComponent({ name: 'AuthCard', filePath: resolver.resolve('./runtime/app/components/AuthCard.vue') })
    }
    if (!withMagicLink && !withVerifyEmail) return
    if (!withUi) {
      console.warn('[@frigear-nu/auth] Magic links / email verification are on, but `@nuxt/ui` is not installed: add your own page at `/auth/magic-link` that posts the `code` to `/api/auth/magic-link/confirm`.')
      return
    }
    addModulePages('@frigear-nu/auth', resolver, [
      { name: 'auth-magic-link', path: '/auth/magic-link', file: './runtime/app/pages/magic-link.vue' },
    ])
  })

  // frigear.nu SSO: the route is always registered when enabled in settings and decides at request time
  // (`previewDeployment` / `frigear.sso`). The button flag is a build time default, overridable through
  // `NUXT_PUBLIC_AUTHENTICATION_FRIGEAR_SSO`.
  const runtimeConfig = nuxt.options.runtimeConfig
  runtimeConfig.authTokensKey ??= ''
  runtimeConfig.frigear = {
    forceId: false,
    keepTokens: keepsTokens('frigear'),
    roleMap: {},
    defaultRole: 'user',
    ...runtimeConfig.frigear,
    sso: { url: '', clientId: '', clientSecret: '', scopes: 'openid profile email', stepUpScopes: '', ...runtimeConfig.frigear?.sso },
  }
  const frigearSso = runtimeConfig.frigear.sso!
  const frigearSsoEnabled = oauthProviders.includes('frigear')
    && (runtimeConfig.previewDeployment === true || !!(frigearSso.clientId && frigearSso.clientSecret))
  if (oauthProviders.includes('frigear')) {
    addPlugin({ src: resolver.resolve('./runtime/app/plugins/frigear-color-mode.client'), mode: 'client' })
    const roleMap = runtimeConfig.frigear.roleMap
    if (runtimeConfig.frigear.syncRole === true && !(typeof roleMap === 'string' ? roleMap.trim() : Object.keys(roleMap ?? {}).length)) {
      useLogger('auth').warn('`runtimeConfig.frigear.syncRole` is on, but `frigear.roleMap` maps no role: no role is synced from frigear.nu. Map the frigear.nu roles to local ones (`NUXT_FRIGEAR_ROLE_MAP`).')
    }
  }

  // Housekeeping for the single-use tokens (`auth:clear-expired-tokens`); the cron is opt-out.
  if (withMagicLink || withVerifyEmail || withPasswordReset) {
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.experimental ||= {}
      nitroConfig.experimental.tasks = true
      nitroConfig.tasks ||= {}
      nitroConfig.tasks['auth:clear-expired-tokens'] = {
        handler: resolver.resolve('./runtime/server/tasks/clear-expired-tokens'),
        description: 'Remove expired magic links and password resets.',
      }
      if (settings.cleanup !== false) {
        const cron = settings.cleanup ?? '0 3 * * *'
        nitroConfig.scheduledTasks ||= {}
        const existing = nitroConfig.scheduledTasks[cron]
        nitroConfig.scheduledTasks[cron] = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), 'auth:clear-expired-tokens']
      }
    })
  }

  addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account.dropdown' })

  nuxt.options.runtimeConfig.public.authentication = {
    mode: 'server',
    password: withPassword,
    passwordReset: withPasswordReset,
    webAuthn: withWebAuthn,
    magicLink: withMagicLink,
    verifyEmail: withVerifyEmail,
    oauth: oauthProviders,
    apiTokens: withApiTokens,
    frigearSso: frigearSsoEnabled,
    pages: { login: loginPath, register: registerPath },
    afterLogin: resolveAfterLogin(settings.afterLogin),
    publicPaths: serverPublicPaths({ loginPath, registerPath: localRegisterPath, withPasswordReset }),
  }
}

/**
 * The anonymous entry points of server mode, as route patterns: the sign-in pages that are on, `/auth/**` (the magic
 * link page, `/auth/frigear`, the email change pages of `@frigear-nu/users`), Auth's API and nuxt-auth-utils' session
 * endpoint. Every handler under `/api/auth` that needs a user checks it itself.
 */
function serverPublicPaths(input: { loginPath?: string, registerPath?: string, withPasswordReset: boolean }): string[] {
  const pages = [input.loginPath, input.registerPath].filter((path): path is string => isSafeRedirect(path))
  if (input.loginPath && input.withPasswordReset) pages.push('/forgot-password', '/reset-password')
  return [...pages, '/auth/**', '/api/auth/**', '/api/_auth/**']
}

const NATIVE_PLUGINS = {
  app: '@capacitor/app',
  browser: '@capacitor/browser',
  preferences: '@capacitor/preferences',
  secureStorage: '@aparajita/capacitor-secure-storage',
} as const

/**
 * Who installs `name`: the app itself, or the modules that list it in their `moduleDependencies` (which may be
 * async). Nuxt keeps no record of who pulled a dependency in, so their dependency functions run once more; this only
 * happens on the way to an error.
 */
async function installedBy(nuxt: Nuxt, name: string): Promise<string> {
  const entryName = (entry: unknown) => typeof entry === 'string' ? entry : Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : undefined
  // An app lists it by name, or by a path that resolved to it.
  const own = nuxt.options._installedModules.find(installed => installed.meta?.name === name)?.entryPath
  const listed = nuxt.options.modules.map(entryName).filter((entry): entry is string => !!entry)
  const byApp = listed.some(entry => entry === name || (!!own && own.replace(/\.[cm]?[jt]s$/, '') === entry.replace(/\.[cm]?[jt]s$/, '')))
  const sources = byApp ? ['the app'] : []
  for (const installed of nuxt.options._installedModules) {
    const module = installed.module as { getModuleDependencies?: (nuxt: Nuxt) => unknown }
    const dependencies = await Promise.resolve(module.getModuleDependencies?.(nuxt)).catch(() => undefined)
    if (dependencies && typeof dependencies === 'object' && name in dependencies && installed.meta?.name) sources.push(installed.meta.name)
  }
  return sources.length ? sources.join(', ') : 'another module'
}

// A public OAuth client (PKCE) for SPAs and Capacitor apps: no server, no database. The tokens live in the browser
// or the Keychain, so the app renders on the client only.
function setupClientMode(options: ModuleOptions, nuxt: Nuxt, resolver: ReturnType<typeof createResolver>) {
  const logger = useLogger('auth')
  const client = options.client ?? {}
  const settings = options.settings ?? {}
  const prepare = !!nuxt.options._prepare
  inlineModuleRuntime(nuxt, resolver)
  registerTailwindSource(nuxt, resolver.resolve('./runtime/client/app'))

  // A server render would always be signed out and never match the hydrated page.
  if (nuxt.options._layers.some(layer => (layer.config as { ssr?: unknown }).ssr === true)) {
    throw new Error(`[${MODULE_NAME}] Client mode renders on the client only: remove \`ssr: true\` (the tokens live in the browser or the Keychain).`)
  }
  nuxt.options.ssr = false

  const scopes = client.scopes ?? ['openid']
  if (!scopes.includes('openid')) {
    throw new Error(`[${MODULE_NAME}] \`authentication.client.scopes\` must contain \`openid\`: the signed-in user comes from the id_token.`)
  }

  const callbackPath = `/${(client.callbackPath || '/auth/callback').replace(/^\/+/, '')}`
  const nativeRedirectUri = resolveNativeRedirectUri({ ...client.native, callbackPath }) ?? ''
  // The login page is on by default here (the server mode's is opt-in); `false` leaves it to the app.
  const loginPage = resolvePagePath(settings.pages?.login ?? true, '/login')
  const loginPath = client.redirect?.login ?? loginPage ?? '/login'
  const { mode: storage, file: storageFile } = parseStorageOption(client.storage)

  // The host's own `runtimeConfig.public.authentication.client` wins over the module options.
  const defaults: AuthClientPublicConfig = {
    issuer: client.issuer ?? '',
    clientId: client.clientId ?? '',
    scope: scopes.join(' '),
    apiBase: client.apiBase ?? '',
    apiOrigins: client.apiOrigins ?? [],
    onUnauthorized: client.onUnauthorized ?? 'signOut',
    redirectUri: client.redirectUri ?? '',
    nativeRedirectUri,
    callbackPath,
    discovery: client.discovery !== false,
    endpoints: client.endpoints ?? {},
    authorizationParams: client.authorizationParams ?? {},
    storage,
    redirect: {
      login: loginPath,
      // Paths on this site only, like every redirect (`isSafeRedirect`).
      afterLogin: resolveAfterLogin(client.redirect?.afterLogin),
      afterLogout: resolveAfterLogin(client.redirect?.afterLogout),
    },
    rewriteLoopback: client.dev?.rewriteLoopback ?? true,
  }
  // Declared (so `NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_SECRET` maps onto it) only where a secret is allowed: in
  // production a runtime env var would otherwise end up in the bundle's config.
  const secretAllowed = nuxt.options.dev || client.allowClientSecretInBundle === true
  if (secretAllowed) defaults.clientSecret = ''
  const host = (nuxt.options.runtimeConfig.public as { authentication?: { client?: Partial<AuthClientPublicConfig> } }).authentication?.client
  const clientConfig = mergeClientPublicConfig(host, defaults)
  // Undeclared even when the host's own config declares it empty, or a runtime env var would still fill it in.
  if (!secretAllowed && clientConfig.clientSecret === '') delete clientConfig.clientSecret
  // The host's runtime config can replace the scope too (an env override is checked again when the client starts).
  if (!clientConfig.scope.split(/\s+/).includes('openid')) {
    throw new Error(`[${MODULE_NAME}] \`runtimeConfig.public.authentication.client.scope\` must contain \`openid\`: the signed-in user comes from the id_token.`)
  }

  assertNoClientSecretInBundle({
    dev: nuxt.options.dev,
    prepare,
    allow: client.allowClientSecretInBundle === true,
    env: process.env,
    configured: clientConfig.clientSecret,
  })
  // Nuxt only maps `..._CLIENT_CLIENT_SECRET` onto `client.clientSecret` on its own; the shorter name is read too.
  if (secretAllowed && process.env[SECRET_ENV_NAMES[1]] && !clientConfig.clientSecret) clientConfig.clientSecret = process.env[SECRET_ENV_NAMES[1]]

  // Every server feature flag is off, so code that checks them works in both modes.
  nuxt.options.runtimeConfig.public.authentication = {
    mode: 'client',
    password: false,
    passwordReset: false,
    webAuthn: false,
    magicLink: false,
    verifyEmail: false,
    oauth: [],
    apiTokens: false,
    frigearSso: false,
    pages: { login: loginPage, register: undefined },
    afterLogin: resolveAfterLogin(clientConfig.redirect.afterLogin),
    publicPaths: clientPublicPaths({ loginPage, loginPath, callbackPath }),
    client: clientConfig,
  }

  // Native plugins are optional peers: `#auth/native` only imports the installed ones.
  const installed = (pkg: string) => isPackageInstalled(pkg, nuxt.options.rootDir, nuxt.options.modulesDir)
  const plugins = Object.fromEntries(Object.entries(NATIVE_PLUGINS).map(([key, pkg]) => [key, installed(pkg)])) as Record<keyof typeof NATIVE_PLUGINS, boolean>
  const { warning } = checkNativeStorage({
    mode: storage,
    dev: nuxt.options.dev,
    prepare,
    capacitor: installed('@capacitor/core'),
    secureStorage: plugins.secureStorage,
    preferences: plugins.preferences,
  })
  if (warning) logger.warn(warning)
  if (installed('@capacitor/core') && !plugins.browser) logger.warn('`@capacitor/browser` is not installed: a native app signs in by leaving the app for the system browser\'s redirect, which cannot come back. Install it.')
  if (installed('@capacitor/core') && !plugins.app) logger.warn('`@capacitor/app` is not installed: the app cannot receive the OAuth redirect. Install it.')
  const customStorage = storageFile && (isAbsolute(storageFile) || storageFile.startsWith('.') ? resolve(nuxt.options.rootDir, storageFile) : storageFile)

  defineVirtualRegistry(nuxt, {
    filename: 'auth/native.mjs',
    alias: '#auth/native',
    collect: () => ({ installed: plugins, customStorage, helper: resolver.resolve('./runtime/client/capacitor/adapters') }),
    contents: nativeLoaderTemplate,
  })

  // nuxt-auth-utils is not installed, so `#auth-utils` is the stand-in with the same session types.
  nuxt.options.alias['#auth-utils'] = resolver.resolve('./runtime/client/auth-utils')
  const clientTypes = (file: string) => JSON.stringify(resolver.resolve(`./runtime/client/${file}`))
  // Next to the generated module, so TypeScript reads these types instead of inferring them from the JavaScript.
  addTemplate({
    filename: 'auth/native.d.mts',
    write: true,
    getContents: () => `import type { AppPluginLike, BrowserPluginLike, PreferencesPluginLike, SecureStoragePluginLike } from ${clientTypes('capacitor/adapters')}
import type { TokenStorage } from ${clientTypes('core/types')}
export declare const plugins: {
  app: (() => Promise<AppPluginLike>) | null
  browser: (() => Promise<BrowserPluginLike>) | null
  preferences: (() => Promise<PreferencesPluginLike>) | null
  secureStorage: (() => Promise<SecureStoragePluginLike>) | null
}
export declare const customStorage: (() => Promise<TokenStorage | (() => TokenStorage | Promise<TokenStorage>)>) | null
`,
  })
  addTypeTemplate({
    filename: 'types/auth-client.d.ts',
    getContents: () => `import type { IdTokenClaims, OAuthError, SignOutReason } from ${clientTypes('core/index')}

// In client mode \`user.id\` is the issuer's \`sub\`. Module code that runs in both modes treats \`id\` as opaque.
declare module '#auth-utils' {
  interface User {
    id: string
    sub: string
  }
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /** After a sign-in completed (not when a stored session is restored). */
    'auth:signed-in': (ctx: { user: import('#auth-utils').User, claims: IdTokenClaims }) => void | Promise<void>
    /** After the session ended (\`logout\`, a rejected refresh token, the API refusing the tokens, no identity). */
    'auth:signed-out': (ctx: { reason: SignOutReason }) => void | Promise<void>
    /** When a refresh failed but the session was kept (offline, server error, client misconfigured). */
    'auth:refresh-failed': (ctx: { error: OAuthError }) => void | Promise<void>
    /**
     * When the user could not be read: a stored session without identity (cleared), or a failed \`mapUser\` /
     * userinfo mapping (\`user\` is then the claims mapping).
     */
    'auth:user-failed': (ctx: { error: unknown }) => void | Promise<void>
  }
}

export {}
`,
  }, { nuxt: true })

  // The user mapping (`client.mapUser` / `client.userinfo`), imported statically by the client plugin.
  const clientUser = addTemplate({
    filename: 'auth/client-user.mjs',
    write: true,
    getContents: async () => {
      const mapUserPath = client.mapUser ? await resolver.resolvePath(client.mapUser, { cwd: nuxt.options.rootDir }) : undefined
      return [
        mapUserPath ? `export { default as mapUser } from ${JSON.stringify(mapUserPath)}` : 'export const mapUser = null',
        `export const userinfo = ${client.userinfo === true}`,
        '',
      ].join('\n')
    },
  })
  nuxt.options.alias['#auth/client-user'] = clientUser.dst
  addTemplate({
    filename: 'auth/client-user.d.mts',
    write: true,
    getContents: () => `export declare const mapUser: import(${clientTypes('core/types')}).AuthClientMapUser | null
export declare const userinfo: boolean
`,
  })

  addImports([
    { name: 'useAuth', from: resolver.resolve('./runtime/client/app/composables/useAuth') },
    { name: 'useUserSession', from: resolver.resolve('./runtime/client/app/composables/useUserSession') },
    { name: 'useApi', from: resolver.resolve('./runtime/client/app/composables/useApi') },
    { name: 'useAuthPages', from: resolver.resolve('./runtime/app/composables/useAuthPages') },
  ])
  addPlugin({ src: resolver.resolve('./runtime/client/app/plugins/auth.client'), mode: 'client' })
  addPlugin(resolver.resolve('./runtime/client/app/plugins/api'))

  nuxt.hook('modules:done', async () => {
    // nuxt-auth-utils needs a server for its session endpoints, Users a database.
    for (const [name, aliases, reason] of [
      ['nuxt-auth-utils', ['nuxt-auth-utils', 'auth-utils'], 'it needs a server for its session endpoints'],
      ['@frigear-nu/users', ['@frigear-nu/users'], 'it needs a database'],
    ] as const) {
      if (!aliases.some(alias => hasNuxtModule(alias, nuxt))) continue
      throw new Error(`[${MODULE_NAME}] \`${name}\` is installed (by ${await installedBy(nuxt, name)}), but client mode has no server: ${reason}. Remove it, or use \`authentication.mode: 'server'\`.`)
    }
    const guarded = findGuardRules(nuxt.options.routeRules as Record<string, unknown>)
    if (guarded.length && !hasNuxtModule('@frigear-nu/authorization', nuxt) && !prepare) {
      logger.warn(`\`routeRules\` guard ${guarded.map(pattern => `\`${pattern}\``).join(', ')} (\`authenticated\`, \`roles\`, \`guest\`, \`ability\`), but \`@frigear-nu/authorization\` is not installed: nothing checks them. Install it.`)
    }

    // The pages and the button are Nuxt UI components; without it the app brings its own.
    if (!hasNuxtModule('@nuxt/ui', nuxt)) {
      if (nuxt.options.dev && (loginPage || settings.pages?.callback !== false)) {
        logger.info('`@nuxt/ui` is not installed: no login and callback pages. Add your own (`useAuth().login()` / `completeLogin()`).')
      }
      return
    }
    addComponent({ name: 'AuthSignInButton', filePath: resolver.resolve('./runtime/client/app/components/AuthSignInButton.vue') })
    addModulePages(MODULE_NAME, resolver, [
      { name: 'auth-login', path: loginPage, file: './runtime/client/app/pages/login.vue' },
      { name: 'auth-callback', path: settings.pages?.callback === false ? undefined : callbackPath, file: './runtime/client/app/pages/callback.vue' },
    ])
  })
}
