import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { registerDatabaseTable } from '@frigear-nu/module-kit/utils'

export type ModuleOptions = {
  // When the mode is server, it also registers the
  // oauth stuff so the app can be used to log in with as well as to.
  mode: 'server'
  settings?: {
    migrations?: boolean
    schemas?: {
      users?: 'default' | string // can be any file path to a drizzle schema file, or 'default' to use the default one.
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
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/users', configKey: 'users' },
  defaults: { mode: 'server', settings: { migrations: true, schemas: { users: 'default' } } },
  async setup(options, nuxt) {
    if (options.mode === 'client') {
      console.log('Users module is running in client mode - will be built accordingly to support oauth.')
    }
    else if (options.mode === 'server') {
      await registerDatabaseTable(nuxt, {
        name: 'users',
        resolver: createResolver(import.meta.url),
        schema: dialect => `./runtime/db/schema.${dialect}`,
        override: options.settings?.schemas?.users,
      })
    }
  },
})
