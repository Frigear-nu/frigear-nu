// The subset of settings composables/pages need to read on the client, exposed through
// `runtimeConfig.public.account`.
/** A downloadable file listed on the documents page. */
export type AccountDocument = {
  id: string
  /** A string, or a map of locale -> string (falls back to `en`, then the first value). */
  label: string | Record<string, string>
  /** Where the file is served from, e.g. `/assets/files/handbook.pdf`. */
  path: string
  icon?: string
  /**
   * Only shown to users with one of these roles (the `role` of the session user). Omit to show to every signed-in
   * user. This only decides what is *listed*: a file in `public/` can still be fetched by anyone who knows its URL.
   */
  roles?: string[]
}

export type PublicModuleOptions = {
  pages: {
    index?: string
    profile?: string
    security?: string
    documents?: string
    apiTokens?: string
  }
  documents: AccountDocument[]
}

export type ModuleOptions = {
  settings?: {
    // Each page accepts a custom path (string), `true` for the default path, or `false`/omitted
    // to disable it. Enabling a page requires `@nuxt/ui` to be installed in the consuming app,
    // since the shipped pages are built with it.
    pages?: {
      // The dashboard/tiles overview page. Only registered when `@frigear-nu/menu` is
      // also installed, since it lists tiles contributed through that module.
      index?: string | boolean
      profile?: string | boolean
      security?: string | boolean
      // Lists `settings.documents` for download. Defaults to off.
      documents?: string | boolean
      // Create and revoke personal API tokens (`@frigear-nu/auth`). Defaults to off.
      apiTokens?: string | boolean
    }
    documents?: AccountDocument[]
  }
}
