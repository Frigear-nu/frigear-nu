/**
 * A single menu entry. Deliberately framework-agnostic (no Vue/Nuxt types) and presentation-free -
 * `description`/`icon` are optional fields a view may use or ignore, but the data never encodes
 * how it's rendered (no colors, no markup).
 */
export type MenuItem = {
  /**
   * Stable identifier, useful for `:key` bindings or for overriding/removing an item later.
   * When omitted it's derived deterministically from `to` (if present) or a slug of `label`.
   */
  id?: string
  /**
   * Matches the `label` field of `@frigear-nu/base`'s `config` content collection `navigation`
   * entries, so content-sourced and module-sourced items share the exact same shape.
   */
  label: string
  /**
   * Optional i18n key (e.g. `users.menu.logout.label`). When `@nuxtjs/i18n` is installed and the
   * key exists for the active locale, `useMenu` returns its translation as `label`; otherwise the
   * plain `label` above is the fallback. Ids are always derived from the untranslated `label`.
   */
  labelKey?: string
  description?: string
  /** Optional i18n key for `description`, resolved the same way as `labelKey`. */
  descriptionKey?: string
  icon?: string
  to?: string
  external?: boolean
  /**
   * Makes the item an action instead of a link: a view sends a request with this method to `to` (e.g. `POST
   * /api/auth/logout`) and then reloads the site's home page, instead of navigating to `to`.
   */
  method?: 'post'
  tags?: string[]
  /** Lower numbers render first. Items without an `order` are rendered last, in registration order. */
  order?: number
  /**
   * The group (the part after the menu's first dot) this item belongs to. Set automatically from
   * the path passed to `extendMenu`/`extendMenuItem`, but an explicit value here always wins.
   */
  group?: string
  /**
   * The permission (`resource:action`) a viewer must hold to see the item. Menus only hide what the viewer cannot
   * use; the route behind the item still checks the permission itself. Filtering is done by a `menus:filter` listener
   * (`@frigear-nu/authorization`); without one, the item is shown.
   */
  permission?: string
  meta?: Record<string, unknown>
}

/** The `menus:filter` runtime hook: remove items from `ctx.items` that the viewer may not see. */
export type MenuFilterContext = {
  /** The menu name (`dashboard`). */
  menu: string
  /** The path passed to `useMenu` (`dashboard.more`, `dashboard.*`). */
  path: string
  /** The resolved, sorted items; replace or splice to filter. */
  items: MenuItem[]
}

/** A named collection of `MenuItem`s, keyed by group (`''` for the root group). */
export type Menu = Record<string, MenuItem[]>

/**
 * A module's `runtime/menus.ts` file exports a default function matching this signature, wrapped
 * in `defineMenuSource` for typing/DX. It receives the registered menu's root group items array
 * directly, so pushing an item there is as simple as `items.push({ ... })`. Use the auto-imported
 * `extendMenuItem(path, item)` to push into a named group (in this or another menu) instead.
 */
export type MenuSource = (items: MenuItem[]) => void | Promise<void>

export type MenuContentSourceOptions = {
  /** Content collection to read the menu's base items from. Defaults to `'config'`. */
  collection?: string
  /** Field on the collection holding the `MenuItem[]`. Defaults to `'navigation'`. */
  field?: string
}

export type ModuleOptions = {
  /**
   * Enables the `@nuxt/content`-backed source for one or more menus. Maps a menu name to `true`
   * (use the default `config` collection's `navigation` field) or a `{ collection, field }` pair
   * to read from a different collection/field. Requires `@nuxt/content` to be installed - a
   * clear build-time error is thrown otherwise.
   */
  content?: Record<string, boolean | MenuContentSourceOptions>
}
