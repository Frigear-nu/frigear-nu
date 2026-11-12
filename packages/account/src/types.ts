import type { Permission } from '@frigear-nu/auth/access'

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
   * The permission (`resource:action`) a user must hold to see the document listed. Omit to show it to every
   * signed-in user. Needs `@frigear-nu/authorization`; without it a document with a permission is never listed. This only
   * decides what is *listed*: a file in `public/` can still be fetched by anyone who knows its URL.
   */
  permission?: Permission
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
  /** `@frigear-nu/oauth-server` is installed: the Security page lists the applications the user is signed in to. */
  signedInApps?: boolean
}

/**
 * An application the user is signed in to (all its live sign-ins, on every device), as `GET /api/oauth-server/me/sessions`
 * of `@frigear-nu/oauth-server` answers it. `id` is the application id.
 */
export type AccountSignedInApp = {
  id: string
  application: { id: string, name: string, icon: string | null }
  signedInAt: string
  lastActiveAt: string
  expiresAt: string
  /** How many live sign-ins (devices, browsers or app installs) the application has. */
  sessions: number
}

export type ModuleOptions = {
  settings?: {
    /**
     * Renders `/account`, `/account/**` and the configured page paths in the `account` layout (the site layout with
     * a left account navigation). An `account` layout of the app (`app/layouts/account.vue`) or a layer replaces the
     * module's and the area still renders in it. `false` registers no layout and sets no layout rule: the pages render
     * in whatever layout the app picks. Defaults to `true`.
     */
    layout?: boolean
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
