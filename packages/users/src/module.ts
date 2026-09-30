import { addImports, addServerHandler, addServerImportsDir, addServerPlugin, addServerTemplate, createResolver, defineNuxtModule, installModule } from '@nuxt/kit'
import { extendDatabaseTable } from '@frigear-nu/module-kit/utils'
import { defu } from 'defu'

type OAuthProviderConfig = { clientId?: string, clientSecret?: string }

// The "simple" nuxt-auth-utils OAuth routes we ship out of the box. Each key maps to a
// static `./runtime/server/routes/auth/<provider>.get.ts` route bundled with this module.
const SUPPORTED_OAUTH_PROVIDERS = ['github', 'google', 'discord'] as const
type OAuthProvider = typeof SUPPORTED_OAUTH_PROVIDERS[number]

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
    // Registers any of the supported "simple" nuxt-auth-utils OAuth routes (e.g. `/api/auth/github`)
    // and forwards the given credentials to `runtimeConfig.oauth`.
    oauth?: Partial<Record<OAuthProvider, OAuthProviderConfig | true>>
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
  async setup(options, nuxt) {
    if (options.mode === 'client') {
      console.log('Users module is running in client mode - will be built accordingly to support oauth.')
      return
    }

    const resolver = createResolver(import.meta.url)
    const settings = options.settings ?? {}
    const withPassword = settings.password !== false
    const withWebAuthn = settings.webAuthn === true

    await installModule('nuxt-auth-utils', { webAuthn: withWebAuthn })

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
    addServerPlugin(resolver.resolve('./runtime/server/plugins/session'))

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

    for (const provider of SUPPORTED_OAUTH_PROVIDERS) {
      const config = settings.oauth?.[provider]
      if (!config) continue

      addServerHandler({ route: `/api/auth/${provider}`, handler: resolver.resolve(`./runtime/server/routes/auth/${provider}.get`) })
      nuxt.options.runtimeConfig.oauth = defu(
        nuxt.options.runtimeConfig.oauth,
        { [provider]: config === true ? {} : config },
      )
    }

    // Login/register pages switch the consuming app into Vue Router's pages mode, so they
    // are opt-in (`settings.pages: true`) rather than enabled by default.
    if (settings.pages === true) {
      nuxt.hook('pages:extend', (pages) => {
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
