import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerTemplate,
  addTemplate,
  createResolver,
  defineNuxtModule,
  extendPages, hasNuxtModule,
} from '@nuxt/kit'
import { upperFirst } from 'scule'
import { registerDatabaseTable, registerLocales } from '@frigear-nu/module-kit/utils'
import type { AuthEmailContext } from './runtime/server/utils/auth-email'
import {
  type AuthMethodObject,
  type AuthManifest,
  type ModuleOptions,
  type PublicModuleOptions,
  OAUTH_PROVIDERS,
  type OAuthProvider,
} from './types'

export {
  type AuthMethod,
  type AuthMethodObject,
  type AuthManifest,
  type ModuleOptions,
  type PublicModuleOptions,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  type OAuthProviderDetails,
} from './types'

// We ship ready-to-use "simple" OAuth routes for these providers only. nuxt-auth-utils itself
// supports many more (https://github.com/atinux/nuxt-auth-utils) - for any other provider, the
// implementing app can add its own `/api/auth/<provider>.get.ts` route using the matching
// `defineOAuth<Provider>EventHandler`, which is auto-imported once this module installs
// `nuxt-auth-utils`. Provider credentials are read by nuxt-auth-utils from runtime environment
// variables, so route registration only depends on the provider being enabled in module settings.

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** An auth email (magic link, email verification) is about to be sent; replace `ctx.notification`'s subject/body to brand it. */
    'users:email': (ctx: AuthEmailContext) => void | Promise<void>
  }
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    users?: ModuleOptions
  }

  interface RuntimeConfig {
    users?: { magicLinkSignUp: boolean }
  }

  interface PublicRuntimeConfig {
    authMethods: AuthMethodObject[]
    users?: PublicModuleOptions
  }
}

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/users', configKey: 'users' },
  defaults: {
    mode: 'server',
    settings: {
      migrations: true,
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
    if (options.mode === 'client') {
      console.log('Users module is running in client mode - will be built accordingly to support oauth.')
      return
    }
    const resolver = createResolver(import.meta.url)

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}
    const withPassword = settings.password !== false
    const withPasswordReset = withPassword && settings.passwordReset !== false
    const withWebAuthn = settings.webAuthn === true
    const withMagicLink = !!settings.magicLink
    const withVerifyEmail = withPassword && settings.verifyEmail === true
    const withMenus = hasNuxtModule('@frigear-nu/menu')
    const withI18n = nuxt.options.modules?.some(mod => mod === '@nuxtjs/i18n' || (Array.isArray(mod) && mod[0] === '@nuxtjs/i18n'))
    const authMethods: AuthMethodObject[] = []
    if (!withWebAuthn) {
      nuxt.options.auth ||= {}
      nuxt.options.auth.webAuthn = false
    }

    const tablesToRegister = ['users']
    if (withWebAuthn) {
      tablesToRegister.push('userPasskeys')
    }
    if (withPasswordReset) {
      tablesToRegister.push('passwordResets')
    }

    // Verification emails are magic links too, so they share the table.
    if (withMagicLink || withVerifyEmail) {
      tablesToRegister.push('magicLinks')
    }

    await registerDatabaseTable(nuxt, {
      name: tablesToRegister,
      resolver,
      schema: dialect => `./runtime/db/schema.${dialect}`,
    })

    // Session enrichment: generate a virtual module re-exporting the user-provided mapper
    // (or a pass-through default) so the runtime plugin can import it statically.
    addServerTemplate({
      filename: '#users/session-mapper',
      getContents: async () => {
        if (!settings.session?.mapper) return 'export default (user) => user'
        const mapperPath = await resolver.resolvePath(settings.session.mapper, { cwd: nuxt.options.rootDir })
        return `export { default } from ${JSON.stringify(mapperPath)}`
      },
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    addServerHandler({
      route: '/auth/logout',
      method: 'get',
      handler: resolver.resolve('./runtime/server/routes/auth/logout.get'),
    })

    if (withPassword) {
      authMethods.push({
        label: withI18n ? 'auth.emailPassword.label' : 'Email & Password',
        value: 'emailPassword',
        icon: 'i-lucide-user-lock',
      })
      addServerHandler({
        route: '/api/auth/login',
        handler: resolver.resolve('./runtime/server/routes/auth/login.post'),
      })
      addServerHandler({
        route: '/api/auth/register',
        handler: resolver.resolve('./runtime/server/routes/auth/register.post'),
      })
    }
    if (withPasswordReset) {
      addServerHandler({
        route: '/api/auth/forgot-password',
        handler: resolver.resolve('./runtime/server/routes/auth/forgot-password.post'),
      })
      addServerHandler({
        route: '/api/auth/reset-password',
        handler: resolver.resolve('./runtime/server/routes/auth/reset-password.post'),
      })
    }
    if (withMagicLink || withVerifyEmail) {
      addServerHandler({
        route: '/auth/magic-link',
        method: 'get',
        handler: resolver.resolve('./runtime/server/routes/auth/magic-link.get'),
      })
    }
    if (withMagicLink) {
      authMethods.push({
        label: withI18n ? 'auth.magicLink.title' : 'Magic link',
        value: 'magicLink',
        icon: 'i-lucide-wand-sparkles',
      })
      addServerHandler({
        route: '/api/auth/magic-link',
        method: 'post',
        handler: resolver.resolve('./runtime/server/routes/auth/magic-link.post'),
      })
    }
    addImports([
      { name: 'useUserMagicLink', from: resolver.resolve('./runtime/app/composables/useUserMagicLink') },
      { name: 'useUserLogin', from: resolver.resolve('./runtime/app/composables/useUserLogin') },
      {
        name: 'useUserRegistration',
        from: resolver.resolve('./runtime/app/composables/useUserRegistration'),
      },
      { name: 'useUserPasswordReset', from: resolver.resolve('./runtime/app/composables/useUserPasswordReset') },
    ])

    if (withWebAuthn) {
      authMethods.push({
        label: withI18n ? 'auth.passkeys.label' : 'Passkey',
        value: 'passkeys',
        icon: 'i-lucide-key',
      })
      addServerHandler({
        route: '/api/auth/webauthn/register',
        handler: resolver.resolve('./runtime/server/routes/auth/webauthn/register.post'),
      })
      addServerHandler({
        route: '/api/auth/webauthn/authenticate',
        handler: resolver.resolve('./runtime/server/routes/auth/webauthn/authenticate.post'),
      })
      addServerHandler({
        route: '/api/auth/webauthn/credentials',
        handler: resolver.resolve('./runtime/server/routes/auth/webauthn/credentials/index.get'),
      })
      addServerHandler({
        route: '/api/auth/webauthn/credentials/:id',
        method: 'delete',
        handler: resolver.resolve('./runtime/server/routes/auth/webauthn/credentials/[id].delete'),
      })
    }
    addImports([{
      name: 'useUserPasskeys',
      from: resolver.resolve('./runtime/app/composables/useUserPasskeys'),
    }])

    const enabledOauthProviders: OAuthProvider[] = []
    for (const provider of OAUTH_PROVIDERS) {
      if (!settings.oauth?.[provider]) continue

      authMethods.push({
        label: withI18n ? `auth.oauth.${provider}.label` : upperFirst(provider),
        value: provider,
      })
      addServerHandler({
        route: `/api/auth/${provider}`,
        handler: resolver.resolve(`./runtime/server/routes/auth/${provider}.get`),
      })
      enabledOauthProviders.push(provider)
    }

    // Login/register pages are opt-in (`settings.pages.login`/`settings.pages.register`) rather
    // than enabled by default, since they require `@nuxt/ui` to be installed in the consuming app.
    const loginPath = withPassword || enabledOauthProviders.length > 0
      ? resolvePagePath(settings.pages?.login, '/login')
      : undefined
    const registerPath = withPassword ? resolvePagePath(settings.pages?.register, '/register') : undefined

    // Housekeeping for the single-use tokens (`users:clear-expired-tokens`); the cron is opt-out.
    if (withMagicLink || withVerifyEmail || withPasswordReset) {
      nuxt.hook('nitro:config', (nitroConfig) => {
        nitroConfig.experimental ||= {}
        nitroConfig.experimental.tasks = true
        nitroConfig.tasks ||= {}
        nitroConfig.tasks['users:clear-expired-tokens'] = {
          handler: resolver.resolve('./runtime/server/tasks/clear-expired-tokens'),
          description: 'Remove expired magic links and password resets.',
        }
        if (settings.cleanup !== false) {
          const cron = settings.cleanup ?? '0 3 * * *'
          nitroConfig.scheduledTasks ||= {}
          const existing = nitroConfig.scheduledTasks[cron]
          nitroConfig.scheduledTasks[cron] = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), 'users:clear-expired-tokens']
        }
      })
    }

    nuxt.options.runtimeConfig.users = { magicLinkSignUp: typeof settings.magicLink === 'object' && settings.magicLink.signUp === true }
    nuxt.options.runtimeConfig.public.authMethods = authMethods

    const authManifest: AuthManifest = {
      methods: authMethods,
      pages: {
        login: loginPath,
        register: registerPath,
      },
    }

    addTemplate({
      filename: 'users/auth.manifest.json',
      write: true,
      getContents: () => JSON.stringify(authManifest, null, 2),
    })

    if (loginPath || registerPath) {
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))

        if (loginPath && !existingPaths.has(loginPath)) {
          pages.push({
            name: 'users-login',
            path: loginPath,
            file: resolver.resolve('./runtime/app/pages/login.vue'),
          })
        }
        if (registerPath && !existingPaths.has(registerPath)) {
          pages.push({
            name: 'users-register',
            path: registerPath,
            file: resolver.resolve('./runtime/app/pages/register.vue'),
          })
        }
      })
    }

    if (withMenus) {
      const { registerMenuSource } = await import('@frigear-nu/menu/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account.dropdown' })
    }

    nuxt.options.runtimeConfig.public.users = {
      password: withPassword,
      passwordReset: withPasswordReset,
      webAuthn: withWebAuthn,
      magicLink: withMagicLink,
      verifyEmail: withVerifyEmail,
      oauth: enabledOauthProviders,
      pages: { login: loginPath, register: registerPath },
    }
  },
})
