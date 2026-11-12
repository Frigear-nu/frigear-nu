export type ModuleOptions = {
  settings?: {
    /** Path prefix of the admin area. Defaults to `/admin`. */
    base?: string
    /**
     * The dashboard page at `base`. `true`/omitted = on, `false` = off (modules' own pages still get the layout),
     * or a custom path.
     */
    dashboard?: boolean | string
    /**
     * The permission (`resource:action`) needed to enter the admin area, applied as an access route rule on `<base>/**`
     * (only when `@frigear-nu/authorization` is installed) and carried by the "Admin" account-menu entry. Defaults to
     * `admin:access`, which this module registers and grants to the `admin` role. A custom permission must be registered
     * by the host. Pass `false` to set no rule and guard the area yourself. Replaces the removed `roles` setting.
     */
    permission?: string | false
    /**
     * Applies the `admin` layout to every page under `base` that has no layout of its own. An `admin` layout of the
     * app (`app/layouts/admin.vue`) or a layer replaces the module's and the area still renders in it. `false`
     * registers no layout and sets no layout rule. Defaults to `true`.
     */
    layout?: boolean
    /**
     * Target of the "Back to the site" link in the sidebar footer: a path (localised) or an absolute URL (another
     * host, opened as is). Defaults to `/`. `false` hides the link. Can be set per deploy with
     * `NUXT_PUBLIC_ADMIN_BACK_TO`.
     */
    backTo?: string | false
  }
}

export type PublicModuleOptions = {
  base: string
  dashboard?: string
  backTo?: string | false
}
