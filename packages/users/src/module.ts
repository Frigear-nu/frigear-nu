import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'
import { extendDatabaseSchema } from '@frigear-nu/module-kit/utils'

export type ModuleOptions = {
  // When the mode is server, it also registers the
  // oauth stuff so the app can be used to log in with as well as to.
  mode?: 'server'
  migrations?: false
} | {
  // Client means that the application does not have it's own auth,
  // but relies on a central auth server to log in and manage users - e.g frigear.nu
  mode: 'client'
  // the handler, export default that maps a user from oauth format to object.
  // The default should follow the table structure.
  mapFromHttp?: string
  migrations?: false
} | false

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@frigear-nu/users',
    configKey: 'users',
  },
  // Default configuration options of the Nuxt module
  defaults: {
    mode: 'client', // Default to this, then we see what methods should be available later on depending on runtimeConfig / .env ++
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const runtimeUsers
      = typeof nuxt.options.runtimeConfig.users === 'object' && nuxt.options.runtimeConfig.users !== false
        ? nuxt.options.runtimeConfig.users
        : {}

    const moduleOptions = nuxt.options.runtimeConfig.users = defu(runtimeUsers, options, {
      mode: 'client',
      migrations: true,
    })

    console.log('Module options', moduleOptions)

    extendDatabaseSchema(nuxt, async ({ dialect, paths }) => {
      // TODO: In the future load migrations depending on the client mode?
      console.log('Adding schema for dialect', dialect)
      paths.push(await resolver.resolvePath(`./db/schema.${dialect}`))
    })
  },
})
