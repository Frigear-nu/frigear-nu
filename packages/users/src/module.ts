import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerTemplate,
  addTemplate,
  createResolver,
  defineNuxtModule,
  extendPages,
} from '@nuxt/kit'
import { upperFirst } from 'scule'
import { registerDatabaseTable } from '@frigear-nu/module-kit/utils'
import type { AuthMethodObject, AuthManifest } from './types'

// We ship ready-to-use "simple" OAuth routes for these providers only. nuxt-auth-utils itself
// supports many more (https://github.com/atinux/nuxt-auth-utils) - for any other provider, the
// implementing app can add its own `/api/auth/<provider>.get.ts` route using the matching
// `defineOAuth<Provider>EventHandler`, which is auto-imported once this module installs
// `nuxt-auth-utils`. Provider credentials are read by nuxt-auth-utils from runtime environment
// variables, so route registration only depends on the provider being enabled in module settings.
const OAUTH_PROVIDERS = ['github', 'google'] as const
type OAuthProvider = typeof OAUTH_PROVIDERS[number]

// The subset of settings composables/pages need to read on the client, exposed through
// `runtimeConfig.public.users`.
type PublicModuleOptions = {
  password: boolean
  passwordReset: boolean
  webAuthn: boolean
  oauth: OAuthProvider[]
  pages: { login?: string, register?: string }
}
export type ModuleOptions = {
  // When the mode is server, it also registers the
  // oauth stuff so the app can be used to log in with as well as to.
  mode: 'server'
  settings?: {
    migrations?: boolean
    // Enables the built-in email/password login & register routes, composables and pages.
    // Set to `false` to fully disable password based authentication.
    password?: boolean
    // Enables the "forgot password"/"reset password" routes & composable. Requires `password` to
    // be enabled. Defaults to `true` whenever `password` is enabled.
    passwordReset?: boolean
    // Enables WebAuthn (passkey) registration/authentication routes, composables and DB table.
    webAuthn?: boolean
    // Registers the built-in login/register pages. Each accepts a custom path (string), `true`
    // for the default path, or `false`/omitted to disable. Enabling a page requires `@nuxt/ui`
    // to be installed in the consuming app, since the shipped pages are built with it.
    pages?: {
      login?: string | boolean
      register?: string | boolean
    }
    session?: {
      // Path to a function (default export) mapping the raw DB user to the session user shape.
      mapper?: string
    }
    // Registers the "simple" OAuth routes we ship (e.g. `/api/auth/github`). The provider's
    // client id/secret are configured the same way nuxt-auth-utils expects them (env vars), so
    // there's nothing else to configure here.
    oauth?: Partial<Record<OAuthProvider, boolean>>
    email?: {
      // Path to a function (default export) sending the "reset your password" email, given
      // `{ to, resetUrl }`. When omitted, the link is logged to the console in dev and the
      // route throws in production - set this once an email provider is chosen.
      sendPasswordReset?: string
    }
  }
} | {
  // Client means that the application does not have it's own auth,
  // but relies on a central auth server to log in and manage users - e.g frigear.nu
  mode: 'client'
  settings?: {
    // the handler, export default that maps a user from oauth format to object.
    // The default should follow the table structure.
    mapFromHttp?: string
    migrations?: false
  }
}

declare module '@nuxt/schema' {
  interface NuxtConfig {
    users?: ModuleOptions
  }

  interface RuntimeConfig {
    users?: ModuleOptions
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
      defaults: {
        db: {
          dialect: 'sqlite',
          casing: 'snake_case',
        },
        kv: true,
      },
    },
    '@frigear-nu/module-kit': {
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
    const settings = options.settings ?? {}
    const withPassword = settings.password !== false
    const withPasswordReset = withPassword && settings.passwordReset !== false
    const withWebAuthn = settings.webAuthn === true
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

    // Same pattern as the session mapper above: lets the consuming app plug in whichever email
    // provider it wants, without this module depending on one. Falls back to logging the reset
    // URL in dev, and throwing in production, so the route still behaves predictably unconfigured.
    addServerTemplate({
      filename: '#users/password-reset-mailer',
      getContents: async () => {
        if (!settings.email?.sendPasswordReset) {
          return `export default async function sendPasswordResetEmail({ to, resetUrl }) {
  if (import.meta.dev) {
    console.log(\`[@frigear-nu/users] Password reset requested for \${to}: \${resetUrl}\`)
    return
  }
  throw createError({ statusCode: 500, statusMessage: 'No password reset email sender configured. Set users.settings.email.sendPasswordReset.' })
}`
        }
        const senderPath = await resolver.resolvePath(settings.email.sendPasswordReset, { cwd: nuxt.options.rootDir })
        return `export { default } from ${JSON.stringify(senderPath)}`
      },
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    if (withPassword) {
      authMethods.push({ label: withI18n ? 'auth.emailPassword.label' : 'Email & Password', value: 'emailPassword', icon: 'i-lucide-user-lock' })
      addServerHandler({ route: '/api/auth/login', handler: resolver.resolve('./runtime/server/routes/auth/login.post') })
      addServerHandler({ route: '/api/auth/register', handler: resolver.resolve('./runtime/server/routes/auth/register.post') })
    }
    if (withPasswordReset) {
      addServerHandler({ route: '/api/auth/forgot-password', handler: resolver.resolve('./runtime/server/routes/auth/forgot-password.post') })
      addServerHandler({ route: '/api/auth/reset-password', handler: resolver.resolve('./runtime/server/routes/auth/reset-password.post') })
    }
    addImports([
      { name: 'useUserLogin', from: resolver.resolve('./runtime/app/composables/useUserLogin') },
      { name: 'useUserRegistration', from: resolver.resolve('./runtime/app/composables/useUserRegistration') },
      { name: 'useUserPasswordReset', from: resolver.resolve('./runtime/app/composables/useUserPasswordReset') },
    ])

    if (withWebAuthn) {
      authMethods.push({ label: withI18n ? 'auth.passkeys.label' : 'Passkey', value: 'passkeys', icon: 'i-lucide-key' })
      addServerHandler({ route: '/api/auth/webauthn/register', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/register.post') })
      addServerHandler({ route: '/api/auth/webauthn/authenticate', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/authenticate.post') })
      addServerHandler({ route: '/api/auth/webauthn/credentials', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/credentials/index.get') })
      addServerHandler({ route: '/api/auth/webauthn/credentials/:id', method: 'delete', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/credentials/[id].delete') })
    }
    addImports([{ name: 'useUserPasskeys', from: resolver.resolve('./runtime/app/composables/useUserPasskeys') }])

    const enabledOauthProviders: OAuthProvider[] = []
    for (const provider of OAUTH_PROVIDERS) {
      if (!settings.oauth?.[provider]) continue

      authMethods.push({ label: withI18n ? `auth.oauth.${provider}.label` : upperFirst(provider), value: provider })
      addServerHandler({ route: `/api/auth/${provider}`, handler: resolver.resolve(`./runtime/server/routes/auth/${provider}.get`) })
      enabledOauthProviders.push(provider)
    }

    // Login/register pages are opt-in (`settings.pages.login`/`settings.pages.register`) rather
    // than enabled by default, since they require `@nuxt/ui` to be installed in the consuming app.
    const loginPath = withPassword || enabledOauthProviders.length > 0
      ? resolvePagePath(settings.pages?.login, '/login')
      : undefined
    const registerPath = withPassword ? resolvePagePath(settings.pages?.register, '/register') : undefined

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
          pages.push({ name: 'users-login', path: loginPath, file: resolver.resolve('./runtime/app/pages/login.vue') })
        }
        if (registerPath && !existingPaths.has(registerPath)) {
          pages.push({ name: 'users-register', path: registerPath, file: resolver.resolve('./runtime/app/pages/register.vue') })
        }
      })
    }

    nuxt.options.runtimeConfig.public.users = {
      password: withPassword,
      passwordReset: withPasswordReset,
      webAuthn: withWebAuthn,
      oauth: enabledOauthProviders,
      pages: { login: loginPath, register: registerPath },
    }
  },
})
