import {
  addComponent,
  addImports,
  addPlugin,
  addServerHandler,
  addServerImportsDir,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  extendDatabaseTable,
  moduleApiUrl,
  registerDatabaseTable,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  defineBootstrapRegistry,
} from '@frigear-nu/module-kit/utils'
import {
  OAUTH_PROVIDERS,
  type AuthResolverDefinition,
  type AuthScopeAvailabilityContext,
  type AuthScopeDefinition,
  type ModuleOptions,
  type OAuthProvider,
  type PublicModuleOptions,
} from './types'
import type { AuthUserStoreRegistration } from './runtime/utils/build'
import { USER_TOKEN_PREFIX } from './runtime/utils/tokens'
import type { AuthEmailContext } from './runtime/server/utils/auth-email'

export {
  OAUTH_PROVIDERS,
  type AuthResolverDefinition,
  type AuthScopeAvailabilityContext,
  type AuthScopeDefinition,
  type AuthSettings,
  type ModuleOptions,
  type OAuthProvider,
  type PublicModuleOptions,
} from './types'

// Build-time twin of the server's `isInternalPath`: only same-site absolute paths are followed after sign in.
function resolveAfterLogin(path: string | undefined) {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/'
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    authentication?: ModuleOptions
  }

  interface RuntimeConfig {
    authentication?: { tokenTtlDays: number | null, apiTokenPrefix: string, magicLinkSignUp: boolean, magicLinkCooldown: number }
    // Set by the host (e.g. from the CI preview marker). Enables "Log in with frigear.nu" without `frigear.sso`.
    previewDeployment?: boolean
    frigear?: {
      // frigear.nu is used as the identity provider when `url`, `clientId` and `clientSecret` are set.
      sso?: { url?: string, clientId?: string, clientSecret?: string }
      // Use the frigear.nu user id as the local `users.id` (existing users matched by email are re-keyed).
      forceId?: boolean
      // Apply the `role` claim of frigear.nu to the local user at every login (an admin there is an admin here). Defaults to true.
      syncRole?: boolean
    }
  }

  interface PublicRuntimeConfig {
    authentication?: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Decides per user whether a registered scope may be picked for a token: set `ctx.available = false` to hide it. */
    'auth:scope-available': (ctx: AuthScopeAvailabilityContext) => void | Promise<void>
    /** An auth email (magic link, email verification) is about to be sent; replace `ctx.notification`'s subject/body to brand it. */
    'auth:email': (ctx: AuthEmailContext) => void | Promise<void>
  }
}

const isExternalUrl = (value: string | undefined) => !!value && /^https?:\/\//.test(value)

export default defineNuxtModule<ModuleOptions>({
  // Not `auth`: that key belongs to nuxt-auth-utils.
  meta: { name: '@frigear-nu/auth', configKey: 'authentication' },
  defaults: {
    tokenTtlDays: null,
    settings: {
      password: true,
      webAuthn: false,
      pages: {},
    },
  },
  moduleDependencies: nuxt => ({
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
  }),
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const settings = options.settings ?? {}
    const withPassword = settings.password !== false
    const withPasswordReset = withPassword && settings.passwordReset !== false
    const withWebAuthn = settings.webAuthn === true
    const withMagicLink = !!settings.magicLink
    const withVerifyEmail = withPassword && settings.verifyEmail === true
    const oauthProviders: OAuthProvider[] = OAUTH_PROVIDERS.filter(provider => settings.oauth?.[provider])
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

    // Each table exists only when the feature owning it is enabled. Verification emails are magic links too.
    const tables = ['authUserTokens']
    if (withWebAuthn) tables.push('userCredentials')
    if (withPasswordReset) tables.push('passwordResets')
    if (withMagicLink || withVerifyEmail) tables.push('magicLinks')

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

    const magicLinkSettings = typeof settings.magicLink === 'object' ? settings.magicLink : {}
    nuxt.options.runtimeConfig.authentication = {
      tokenTtlDays: options.tokenTtlDays ?? null,
      apiTokenPrefix,
      magicLinkSignUp: magicLinkSettings.signUp === true,
      magicLinkCooldown: magicLinkSettings.cooldown ?? 60,
    }

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
        if (path) return `export { default } from ${JSON.stringify(path)}`
        const missing = `() => { throw new Error('[auth] No user store: install @frigear-nu/users or set authentication.userStore.') }`
        return `export default { findById: async () => null, findByEmail: async () => null, create: ${missing}, update: ${missing}, remove: ${missing}, changeId: ${missing} }`
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
}
declare module '#auth/session-mapper' {
  const mapSessionUser: (user: Record<string, unknown>) => Record<string, unknown>
  export default mapSessionUser
}
export {}
`,
    }, { nitro: true, nuxt: true })

    // The emails this module sends, as templates @frigear-nu/email-templates renders when installed.
    nuxt.hook('notify:email:templates', sources => sources.push({ dir: resolver.resolve('./runtime/emails') }))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    addServerHandler({
      middleware: true,
      handler: resolver.resolve('./runtime/server/middleware/auth'),
    })

    // The `authUserTokens` table stays registered when tokens are off: removing a user still clears its rows.
    for (const [method, path, file] of [
      ...(withApiTokens
        ? [
            ['get', 'tokens', 'tokens.get'],
            ['post', 'tokens', 'tokens.post'],
            ['delete', 'tokens/:id', 'token.delete'],
          ] as const
        : []),
      ['get', 'scopes', 'scopes.get'],
    ] as const) {
      addServerHandler({ route: moduleApiUrl('auth', path), method, handler: resolver.resolve(`./runtime/server/routes/${file}`) })
    }

    // One request for an area's user-scoped data (`GET /api/_bootstrap?scope=account`): it authenticates once and
    // runs every provider modules registered with `registerBootstrapProvider` for that scope.
    defineBootstrapRegistry(nuxt)
    addServerHandler({ route: '/api/_bootstrap', method: 'get', handler: resolver.resolve('./runtime/server/routes/bootstrap.get') })

    // --- Sign-in flows ----------------------------------------------------------------------------
    const route = (path: string, file: string, method?: 'get' | 'post' | 'delete') => addServerHandler({
      route: path.startsWith('/auth/') ? path : moduleApiUrl('auth', path),
      method,
      handler: resolver.resolve(`./runtime/server/routes/${file}`),
    })

    route('/auth/logout', 'session/logout.get', 'get')
    if (withPassword) {
      route('login', 'session/login.post')
      route('register', 'session/register.post')
    }
    if (withPasswordReset) {
      route('forgot-password', 'session/forgot-password.post')
      route('reset-password', 'session/reset-password.post')
    }
    // The emailed link opens the `/auth/magic-link` page (below); its button signs in through this POST, so a GET
    // (a mail scanner, a link preview) never uses a link up.
    if (withMagicLink || withVerifyEmail) route('magic-link/confirm', 'session/magic-link-confirm.post', 'post')
    if (withMagicLink) route('magic-link', 'session/magic-link.post', 'post')
    if (withWebAuthn) {
      route('webauthn/register', 'webauthn/register.post')
      route('webauthn/authenticate', 'webauthn/authenticate.post')
      route('webauthn/credentials', 'webauthn/credentials/index.get')
      route('webauthn/credentials/:id', 'webauthn/credentials/[id].delete', 'delete')
    }
    // The IdP redirects the browser back to `/auth/frigear` (a navigation, like `/auth/logout`), so it is not under `/api`.
    for (const provider of oauthProviders) route(provider === 'frigear' ? '/auth/frigear' : provider, `oauth/${provider}.get`, 'get')
    if (oauthProviders.includes('frigear')) route('frigear-status', 'oauth/frigear-status.get', 'get')

    addImports([
      'useLogin',
      'useMagicLink',
      'usePasskeys',
      'usePasswordReset',
      'useRegistration',
      'useAuthPages',
      'useAfterLogin',
    ].map(name => ({ name, from: resolver.resolve(`./runtime/app/composables/${name}`) })))

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
    runtimeConfig.frigear = {
      forceId: false,
      ...runtimeConfig.frigear,
      sso: { url: '', clientId: '', clientSecret: '', ...runtimeConfig.frigear?.sso },
    }
    const frigearSso = runtimeConfig.frigear.sso!
    const frigearSsoEnabled = oauthProviders.includes('frigear')
      && (runtimeConfig.previewDeployment === true || !!(frigearSso.clientId && frigearSso.clientSecret))
    if (oauthProviders.includes('frigear')) {
      addPlugin({ src: resolver.resolve('./runtime/app/plugins/frigear-color-mode.client'), mode: 'client' })
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
    }
  },
})
