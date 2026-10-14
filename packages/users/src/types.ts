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
     * A new email address only takes effect once its owner confirms it through an emailed link; the old address then
     * gets a notice with a link to revert the change. Defaults to `false` (applied immediately).
     */
    verifyEmailChange?: boolean
    /** Where the confirmation link of an email change lands (`?email-changed=1` or `?error=email-change`). Defaults to `/`. */
    profilePath?: string
    /** Expose the MCP tools of this module (`get-my-profile`) on the MCP endpoint. Needs `@frigear-nu/mcp`. Defaults to `false`. */
    mcp?: boolean
  }
}
