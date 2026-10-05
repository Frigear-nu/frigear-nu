/**
 * A single navigation/dashboard tile. Deliberately framework-agnostic (no Vue/Nuxt types) so it
 * can be constructed from a module's `setup()`-time `runtime/navigation.ts` file as well as from
 * app code at runtime.
 */
export type NavigationItem = {
  /** Stable identifier, useful for `:key` bindings or removing/replacing an item later. */
  id?: string
  title: string
  description?: string
  icon?: string
  to?: string
  external?: boolean
  /** Lower numbers render first. Items without an `order` are rendered last, in registration order. */
  order?: number
  onClick?: () => void | Promise<void>
  meta?: Record<string, unknown>
}

/**
 * A module's `runtime/navigation.ts` file exports a default function matching this signature,
 * wrapped in `defineNavigationFile` for typing/DX. It receives the root group's items array
 * directly, so pushing an item to the root group is as simple as `items.push({ ... })`. Use the
 * auto-imported `extendNavigationItem(path, item)` to push into a named (possibly nested, e.g.
 * `'account.menu'`) group instead.
 */
export type NavigationFile = (items: NavigationItem[]) => void | Promise<void>

export type ModuleOptions = Record<string, never>
