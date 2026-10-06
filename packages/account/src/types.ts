// The subset of settings composables/pages need to read on the client, exposed through
// `runtimeConfig.public.account`.
export type PublicModuleOptions = {
  pages: {
    index?: string
    profile?: string
    security?: string
  }
}

export type ModuleOptions = {
  settings?: {
    // Each page accepts a custom path (string), `true` for the default path, or `false`/omitted
    // to disable it. Enabling a page requires `@nuxt/ui` to be installed in the consuming app,
    // since the shipped pages are built with it.
    pages?: {
      // The dashboard/tiles overview page. Only registered when `@frigear-nu/menus` is
      // also installed, since it lists tiles contributed through that module.
      index?: string | boolean
      profile?: string | boolean
      security?: string | boolean
    }
  }
}
