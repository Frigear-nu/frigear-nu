import {
  addComponent,
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  extendPages,
} from '@nuxt/kit'
import {
  extendDatabaseTable,
  moduleApiUrl,
  registerDatabaseTable,
  registerLocales,
  registerTailwindSource,
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

declare module 'nuxt/schema' {
  interface NuxtConfig {
    authentication?: ModuleOptions
  }

  interface RuntimeConfig {
    authentication?: { tokenTtlDays: number | null, magicLinkSignUp: boolean, magicLinkCooldown: number }
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

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

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
  moduleDependencies: {
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
    },
    'nuxt-auth-utils': {
      version: '>=0.0.1',
      defaults: { webAuthn: true },
    },
  },
  async setup(options, nuxt) {
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
    if (!withWebAuthn) {
      nuxt.options.auth ||= {}
      nuxt.options.auth.webAuthn = false
    }

    // Each table exists only when the feature owning it is enabled. Verification emails are magic links too.
    const tables = ['authUserTokens']
    if (withWebAuthn) tables.push('userCredentials')
    if (withPasswordReset) tables.push('passwordResets')
    if (withMagicLink || withVerifyEmail) tables.push('magicLinks')

    await registerDatabaseTable(nuxt, {
      name: tables,
      resolver,
      schema: dialect => `./runtime/db/schema.${dialect}`,
    })

    // Credential columns on the `users` table owned by `@frigear-nu/users` (ignored when that module is absent).
    extendDatabaseTable(nuxt, {
      name: 'users',
      resolver,
      file: dialect => `./runtime/db/users.${dialect}`,
    })

    const magicLinkSettings = typeof settings.magicLink === 'object' ? settings.magicLink : {}
    nuxt.options.runtimeConfig.authentication = {
      tokenTtlDays: options.tokenTtlDays ?? null,
      magicLinkSignUp: magicLinkSettings.signUp === true,
      magicLinkCooldown: magicLinkSettings.cooldown ?? 60,
    }

    // Bearer resolvers: the built-in user-token one plus whatever other modules register.
    addServerTemplate({
      filename: '#auth/resolvers',
      getContents: async () => {
        const registered: AuthResolverDefinition[] = [{
          name: 'user-token',
          prefix: 'fnu_',
          order: 50,
          resolver: resolver.resolve('./runtime/server/resolvers/user-token'),
        }]
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
        return `export default { findById: async () => null, findByEmail: async () => null, create: ${missing}, update: ${missing}, remove: ${missing} }`
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

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    addServerHandler({
      middleware: true,
      handler: resolver.resolve('./runtime/server/middleware/auth'),
    })

    for (const [method, path, file] of [
      ['get', 'tokens', 'tokens.get'],
      ['post', 'tokens', 'tokens.post'],
      ['delete', 'tokens/:id', 'token.delete'],
      ['get', 'scopes', 'scopes.get'],
    ] as const) {
      addServerHandler({ route: moduleApiUrl('auth', path), method, handler: resolver.resolve(`./runtime/server/routes/${file}`) })
    }

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
    if (withMagicLink || withVerifyEmail) route('/auth/magic-link', 'session/magic-link.get', 'get')
    if (withMagicLink) route('magic-link', 'session/magic-link.post', 'post')
    if (withWebAuthn) {
      route('webauthn/register', 'webauthn/register.post')
      route('webauthn/authenticate', 'webauthn/authenticate.post')
      route('webauthn/credentials', 'webauthn/credentials/index.get')
      route('webauthn/credentials/:id', 'webauthn/credentials/[id].delete', 'delete')
    }
    for (const provider of oauthProviders) route(provider, `oauth/${provider}.get`)

    addImports([
      'useLogin',
      'useMagicLink',
      'usePasskeys',
      'usePasswordReset',
      'useRegistration',
      'useAuthPages',
    ].map(name => ({ name, from: resolver.resolve(`./runtime/app/composables/${name}`) })))

    // Login/register pages are opt-in (`settings.pages.login`/`settings.pages.register`) rather than enabled by
    // default, since they require `@nuxt/ui` to be installed in the consuming app.
    const loginPath = withPassword || oauthProviders.length > 0
      ? resolvePagePath(settings.pages?.login, '/login')
      : undefined
    const registerPath = withPassword ? resolvePagePath(settings.pages?.register, '/register') : undefined

    if (loginPath || registerPath) {
      addComponent({ name: 'AuthCard', filePath: resolver.resolve('./runtime/app/components/AuthCard.vue') })
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))
        const add = (name: string, path: string | undefined, file: string) => {
          if (path && !existingPaths.has(path)) pages.push({ name: `auth-${name}`, path, file: resolver.resolve(`./runtime/app/pages/${file}.vue`) })
        }
        add('login', loginPath, 'login')
        add('register', registerPath, 'register')
        // The reset link emailed by `/api/auth/forgot-password` points at `/reset-password`.
        if (loginPath && withPasswordReset) {
          add('forgot-password', '/forgot-password', 'forgot-password')
          add('reset-password', '/reset-password', 'reset-password')
        }
      })
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

    const { registerMenuSource } = await import('@frigear-nu/menu/utils')
    registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account.dropdown' })

    nuxt.options.runtimeConfig.public.authentication = {
      password: withPassword,
      passwordReset: withPasswordReset,
      webAuthn: withWebAuthn,
      magicLink: withMagicLink,
      verifyEmail: withVerifyEmail,
      oauth: oauthProviders,
      pages: { login: loginPath, register: registerPath },
    }
  },
})
