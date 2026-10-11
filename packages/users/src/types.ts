export type AuthMethod = (string | 'passkeys' | 'emailPassword')
export type AuthMethodObject = { label: string, value: AuthMethod, icon?: string }
export type AuthManifest = {
  methods: AuthMethodObject[]
  pages: {
    login?: string
    register?: string
  }
}

export const OAUTH_PROVIDERS = ['github', 'google', 'facebook'] as const
export type OAuthProvider = typeof OAUTH_PROVIDERS[number]
export type OAuthProviderDetails = {
  label: string
  value: OAuthProvider
  icon?: string
}

// The subset of settings composables/pages need to read on the client, exposed through
// `runtimeConfig.public.users`.
export type PublicModuleOptions = {
  password: boolean
  passwordReset: boolean
  webAuthn: boolean
  magicLink: boolean
  verifyEmail: boolean
  oauth: OAuthProvider[]
  pages: { login?: string, register?: string, admin?: string }
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
    // Enables password reset routes when password authentication is enabled. Defaults to true.
    passwordReset?: boolean
    // Passwordless sign-in by emailed link (`POST /api/auth/magic-link`, `GET /auth/magic-link`). Following the
    // link also verifies the email address. `signUp: true` creates an account for unknown addresses; `cooldown` is the
    // minimum number of seconds between two links for the same user (default 60).
    magicLink?: boolean | { signUp?: boolean, cooldown?: number }
    // Requires users who register with email/password to verify their address (through an emailed link) before
    // they can log in. No session is created at registration. Defaults to `false`.
    verifyEmail?: boolean
    // User administration for staff: list/create/edit users (`/api/users/admin`), a "new members" widget and an
    // admin page. Who may do what is decided by the host in the `users:admin:authorize` Nitro hook (denied by
    // default). `page` is the admin page path (`true` = `/admin/users`, `false` = no page).
    admin?: boolean | { page?: string | boolean }
    // Cron expression for the task removing expired magic links and password resets, or `false` to schedule
    // nothing (the task `users:clear-expired-tokens` is still registered). Defaults to daily at 03:00.
    cleanup?: string | false
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
