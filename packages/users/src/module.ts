import { addImports, addServerHandler, addServerImportsDir, addServerTemplate, createResolver, defineNuxtModule, extendPages } from '@nuxt/kit'
import { extendDatabaseTable } from '@frigear-nu/module-kit/utils'

// We ship ready-to-use "simple" OAuth routes for these providers only. nuxt-auth-utils itself
// supports many more (https://github.com/atinux/nuxt-auth-utils) - for any other provider, the
// implementing app can add its own `/api/auth/<provider>.get.ts` route using the matching
// `defineOAuth<Provider>EventHandler`, which is auto-imported once this module installs
// `nuxt-auth-utils`. The client id/secret for every provider are read by nuxt-auth-utils itself
// from `NUXT_OAUTH_<PROVIDER>_CLIENT_ID` / `NUXT_OAUTH_<PROVIDER>_CLIENT_SECRET` env vars, so we
// don't duplicate that configuration here - we only need to know whether to register the route.
const OAUTH_ENV_VARS = {
  github: ['NUXT_OAUTH_GITHUB_CLIENT_ID', 'NUXT_OAUTH_GITHUB_CLIENT_SECRET'],
  google: ['NUXT_OAUTH_GOOGLE_CLIENT_ID', 'NUXT_OAUTH_GOOGLE_CLIENT_SECRET'],
} as const
type OAuthProvider = keyof typeof OAUTH_ENV_VARS

export type ModuleOptions = {
  // When the mode is server, it also registers the
  // oauth stuff so the app can be used to log in with as well as to.
  mode: 'server'
  settings?: {
    migrations?: boolean
    schemas?: {
      users?: 'default' | string // can be any file path to a drizzle schema file, or 'default' to use the default one.
    }
    // Enables the built-in email/password login & register routes, composables and pages.
    // Set to `false` to fully disable password based authentication.
    password?: boolean
    // Enables WebAuthn (passkey) registration/authentication routes, composables and DB table.
    webAuthn?: boolean
    // Whether to register the login/register pages. Off by default since it switches the
    // consuming app into Vue Router's pages mode; set to `true` to opt in.
    pages?: boolean
    session?: {
      // Path to a function (default export) mapping the raw DB user to the session user shape.
      mapper?: string
    }
    // Registers the "simple" OAuth routes we ship (e.g. `/api/auth/github`). The provider's
    // client id/secret are configured the same way nuxt-auth-utils expects them (env vars), so
    // there's nothing else to configure here - the route is only registered when the matching
    // env vars are set.
    oauth?: Partial<Record<OAuthProvider, boolean>>
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
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/users', configKey: 'users' },
  defaults: {
    mode: 'server',
    settings: {
      migrations: true,
      schemas: { users: 'default' },
      password: true,
      webAuthn: false,
      pages: false,
    },
  },
  moduleDependencies: (nuxt) => {
    const options = nuxt.options.users
    if (options?.mode === 'client') return {}

    return {
      'nuxt-auth-utils': {
        defaults: { webAuthn: options?.settings?.webAuthn === true },
      },
    }
  },
  async setup(options, nuxt) {
    if (options.mode === 'client') {
      console.log('Users module is running in client mode - will be built accordingly to support oauth.')
      return
    }

    const resolver = createResolver(import.meta.url)
    const settings = options.settings ?? {}
    const withPassword = settings.password !== false
    const withWebAuthn = settings.webAuthn === true

    extendDatabaseTable(nuxt, {
      name: 'users',
      factory: 'defineUsersTable',
      resolver,
      schema: dialect => `./runtime/db/schema.${dialect}`,
      override: settings.schemas?.users,
    })

    if (withWebAuthn) {
      extendDatabaseTable(nuxt, {
        name: 'userCredentials',
        factory: 'defineUserCredentialsTable',
        resolver,
        schema: dialect => `./runtime/db/credentials.schema.${dialect}`,
      })
    }

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

    if (withPassword) {
      addServerHandler({ route: '/api/auth/login', handler: resolver.resolve('./runtime/server/routes/auth/login.post') })
      addServerHandler({ route: '/api/auth/register', handler: resolver.resolve('./runtime/server/routes/auth/register.post') })
      addImports([
        { name: 'useAuthLogin', from: resolver.resolve('./runtime/app/composables/useAuthLogin') },
        { name: 'useAuthRegister', from: resolver.resolve('./runtime/app/composables/useAuthRegister') },
      ])
    }

    if (withWebAuthn) {
      addServerHandler({ route: '/api/auth/webauthn/register', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/register.post') })
      addServerHandler({ route: '/api/auth/webauthn/authenticate', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/authenticate.post') })
      addServerHandler({ route: '/api/auth/webauthn/credentials', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/credentials/index.get') })
      addServerHandler({ route: '/api/auth/webauthn/credentials/:id', method: 'delete', handler: resolver.resolve('./runtime/server/routes/auth/webauthn/credentials/[id].delete') })
      addImports([{ name: 'useAuthPasskeys', from: resolver.resolve('./runtime/app/composables/useAuthPasskeys') }])
    }

    for (const provider of Object.keys(OAUTH_ENV_VARS) as OAuthProvider[]) {
      if (!settings.oauth?.[provider]) continue

      const [clientIdVar, clientSecretVar] = OAUTH_ENV_VARS[provider]
      if (!process.env[clientIdVar] || !process.env[clientSecretVar]) continue

      addServerHandler({ route: `/api/auth/${provider}`, handler: resolver.resolve(`./runtime/server/routes/auth/${provider}.get`) })
    }

    // Login/register pages switch the consuming app into Vue Router's pages mode, so they
    // are opt-in (`settings.pages: true`) rather than enabled by default.
    if (settings.pages === true) {
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))

        if (withPassword && !existingPaths.has('/login')) {
          pages.push({ name: 'login', path: '/login', file: resolver.resolve('./runtime/app/pages/login.vue') })
        }
        if (withPassword && !existingPaths.has('/register')) {
          pages.push({ name: 'register', path: '/register', file: resolver.resolve('./runtime/app/pages/register.vue') })
        }
      })
    }
  },
})
