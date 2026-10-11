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
     * Roles allowed into the admin area, applied as an `@frigear-nu/authorization` route rule on `<base>/**`
     * (only when that module is installed). Defaults to `['admin']`. Pass `false` to set no rule and guard the area yourself.
     */
    roles?: string[] | false
    /** Applies the `admin` layout to every page under `base` that has no layout of its own. Defaults to `true`. */
    layout?: boolean
  }
}

export type PublicModuleOptions = {
  base: string
  dashboard?: string
}
