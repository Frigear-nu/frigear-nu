// The subset of settings composables/pages need to read on the client, exposed through
// `runtimeConfig.public.users`.
export type PublicModuleOptions = {
  /** Where the page of the signed-in user's profile lives; the email change confirmation link lands there. */
  profilePath?: string
  /** Whether `settings.mcp` is on. */
  mcp: boolean
  pages: { admin?: string }
}

export type ModuleOptions = {
  settings?: {
    /**
     * User administration for staff: list/create/edit users (`/api/admin/users`), a "new users" widget and an
     * admin page. Who may do what is decided by the host in the `users:admin:authorize` Nitro hook (denied by
     * default). `page` is the admin page path (`true` = `/admin/users`, `false` = no page).
     */
    admin?: boolean | { page?: string | boolean }
    /**
     * A new email address only takes effect once its owner confirms it: the emailed link opens the
     * `/auth/verify-email-change` page, where the signed-in owner presses "Confirm". The old address then gets a notice
     * with a link to the `/auth/revert-email-change` page. The pages need `@nuxt/ui`. Defaults to `false` (applied
     * immediately).
     */
    verifyEmailChange?: boolean
    /** Where a confirmed email change lands (`?email-changed=1`). Without it the confirm page shows the result itself. */
    profilePath?: string
    /** Expose the MCP tools of this module (`get-my-profile`) on the MCP endpoint. Needs `@frigear-nu/mcp`. Defaults to `false`. */
    mcp?: boolean
  }
}

/** A user as the users admin API returns it (`GET /api/admin/users/:id`, create and edit): an allowlist, never the row. */
export type AdminUserDto = {
  id: number
  name: string
  email: string
  /** Only when an authorization module added the `role` column. */
  role?: string
  avatar: string | null
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

/** The signed-in user's own profile, as the self-service routes return it. */
export type ProfileDto = {
  id: number
  name: string
  email: string
  avatar: string | null
  emailVerifiedAt: string | null
}
