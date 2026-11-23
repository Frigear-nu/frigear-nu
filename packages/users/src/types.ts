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
     * admin page. Who may do what is decided by the permissions `users:read`, `users:list`, `users:create`,
     * `users:update`, `users:delete` and `users:manage` (grant them to roles). `page` is the admin page path
     * (`true` = `/admin/users`, `false` = no page).
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
  avatar: string | null
  /** Only in the detail and edit responses, and only for a caller with `users:pii`. */
  phone?: string | null
  emailVerifiedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

/**
 * A user as other modules show them (`loadUserRefs`, `searchUserRefs`): never a DTO on its own. `email` and `phone`
 * are personal data: copy them into a response only behind the caller's `:pii` permission.
 */
export type UserRef = {
  id: number
  name: string | null
  email: string | null
  avatar: string | null
  phone: string | null
  /** The user's language (`da`, `en-GB`), or `null`: messages to them use it, English when it is not set. */
  locale: string | null
}

/**
 * One person in `UserPicker`: what its search route answers (an array of these, or a page with `items`). `email` is
 * there only where the route lets the caller see it (`users:list` for the users route, a module's `:pii` elsewhere).
 */
export type UserPickerOption = {
  id: number
  name: string | null
  email?: string | null
  avatar?: string | null
}

/** What `UserPicker`'s "Create user" prefills: the search term, or what the host knows of the person (`openCreate(initial)`). */
export type UserPickerCreateInitial = { name?: string, email?: string, phone?: string }

/** The signed-in user's own profile, as the self-service routes return it. */
export type ProfileDto = {
  id: number
  name: string
  email: string
  avatar: string | null
  phone: string | null
  /** The user's language (`da`, `en-GB`), or `null`. Filled from the app's language at sign-in when unset. */
  locale: string | null
  emailVerifiedAt: string | null
}
