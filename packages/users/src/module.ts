import { defineNuxtModule, createResolver } from '@nuxt/kit'

export type ModuleOptions = {
  // When the mode is server, it also registers the
  // oauth stuff so the app can be used to log in with as well as to.
  mode?: 'server'
} | {
  // Client means that the application does not have it's own auth,
  // but relies on a central auth server to log in and manage users - e.g frigear.nu
  mode: 'client'
  // the handler, export default that maps a user from oauth format to object.
  // The default should follow the table structure.
  mapFromHttp?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@frigear-nu/users',
    configKey: 'users',
  },
  // Default configuration options of the Nuxt module
  defaults: {
    mode: 'client', // Default to this, then we see what methods should be available later on depending on runtimeConfig / .env ++
  },
  setup(_options, _nuxt) {
    const _resolver = createResolver(import.meta.url)

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
  },
})
