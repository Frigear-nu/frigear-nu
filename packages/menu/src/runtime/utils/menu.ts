import type { Nuxt } from '@nuxt/schema'
import type { MenuItem, MenuSource } from '../../types'

export type { MenuItem, MenuSource } from '../../types'

export type ParsedMenuPath = {
  menu: string
  group: string
  /**
   * Whether `path` ended in a wildcard group (`'dashboard.*'` or `'dashboard.account.*'`) -
   * matching that group and every group nested under it, rather than a single exact group.
   */
  wildcard: boolean
}

/**
 * Splits a menu path on its *first* dot only, so `'a.b.c'` resolves to menu `'a'`, group `'b.c'`.
 * The group becomes the default group for items registered through that path - an explicit
 * `item.group` always wins.
 *
 * A path ending in `.*` is parsed as a wildcard instead: `'dashboard.*'` resolves to menu
 * `dashboard`, every group (`wildcard: true`, `group: ''`); `'dashboard.account.*'` resolves to
 * every group that is (or is nested under) `account`. Only `useMenu` understands wildcards -
 * `extendMenu`/`extendMenuItem` reject them, since items can only ever be registered into one
 * exact group.
 */
export function parseMenuPath(path: string): ParsedMenuPath {
  const dotIndex = path.indexOf('.')
  if (dotIndex === -1) return { menu: path, group: '', wildcard: false }

  const menu = path.slice(0, dotIndex)
  const rest = path.slice(dotIndex + 1)

  if (rest === '*') return { menu, group: '', wildcard: true }
  if (rest.endsWith('.*')) return { menu, group: rest.slice(0, -2), wildcard: true }

  return { menu, group: rest, wildcard: false }
}

/**
 * Whether `group` is matched by a wildcard's `prefix` (the `group` resolved by `parseMenuPath`
 * for a wildcard path) - the prefix itself, or anything nested under it. An empty `prefix`
 * (`'dashboard.*'`) matches every group.
 */
export function matchesMenuGroup(group: string, prefix: string): boolean {
  if (prefix === '') return true
  return group === prefix || group.startsWith(`${prefix}.`)
}

/**
 * Resolves every item addressed by a parsed menu path out of that menu's groups - a single
 * group's items for a plain path, or every matching group's items (flattened, unsorted) for a
 * wildcard path. Wildcard reads set each item's `group` to the group it was found in, so a view
 * can split one read back into its groups (items pushed by runtime sources carry no `group`).
 */
export function collectMenuItems(groups: Record<string, MenuItem[]> | undefined, parsed: ParsedMenuPath): MenuItem[] {
  if (!groups) return []
  if (!parsed.wildcard) return groups[parsed.group] ?? []

  const matched: MenuItem[] = []
  for (const [group, items] of Object.entries(groups)) {
    if (matchesMenuGroup(group, parsed.group)) matched.push(...items.map(item => ({ ...item, group })))
  }
  return matched
}

export function sortByOrder(items: MenuItem[]): MenuItem[] {
  return [...items].sort((a, b) => {
    if (a.order === undefined && b.order === undefined) return 0
    if (a.order === undefined) return 1
    if (b.order === undefined) return -1
    return a.order - b.order
  })
}

function slugify(value: string): string {
  let result = ''
  let lastWasDash = true // collapses/strips any leading separator run
  for (const char of value.toLowerCase()) {
    const isAlphanumeric = (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9')
    if (isAlphanumeric) {
      result += char
      lastWasDash = false
    }
    else if (!lastWasDash) {
      result += '-'
      lastWasDash = true
    }
  }
  return lastWasDash ? result.slice(0, -1) : result
}

/** Deterministic id for an item missing one: its `to` if present, else a slug of its `label`. */
export function deriveMenuItemId(item: MenuItem): string {
  return item.id ?? item.to ?? slugify(item.label)
}

/** The slice of `@nuxtjs/i18n`'s `$i18n` that `translateMenuItem` needs. */
export type MenuTranslator = {
  t: (key: string) => string
  te: (key: string) => boolean
}

/**
 * Resolves an item's `labelKey`/`descriptionKey` against the active locale, falling back to the
 * plain `label`/`description` when no translator is available or the key has no message. The
 * `id` is derived first, so it stays identical across locales.
 */
export function translateMenuItem(item: MenuItem, i18n?: MenuTranslator): MenuItem {
  if (!i18n || (!item.labelKey && !item.descriptionKey)) return item

  const id = deriveMenuItemId(item)
  const translated: MenuItem = { ...item, id }
  if (item.labelKey && i18n.te(item.labelKey)) translated.label = i18n.t(item.labelKey)
  if (item.descriptionKey && i18n.te(item.descriptionKey)) translated.description = i18n.t(item.descriptionKey)
  return translated
}

function normalizeItems(group: string, items: MenuItem | MenuItem[]): MenuItem[] {
  const list = Array.isArray(items) ? items : [items]
  const seen = new Set<string>()

  return list.map((item) => {
    const normalized: MenuItem = { group, ...item }
    const id = deriveMenuItemId(normalized)

    if (import.meta.dev !== false && seen.has(id)) {
      console.warn(`[@frigear-nu/menu] Duplicate menu item id "${id}" registered in the same batch.`)
    }
    seen.add(id)

    return { ...normalized, id }
  })
}

/**
 * Build-time API for other modules to contribute static items to a menu, without the host app
 * wiring anything. Call it once during a module's own `setup()`:
 *
 * ```ts
 * import { extendMenu } from '@frigear-nu/menu/utils'
 *
 * export default defineNuxtModule({
 *   setup(options, nuxt) {
 *     extendMenu(nuxt, 'dashboard.more', [
 *       { label: 'Billing', description: 'Manage your subscription' },
 *     ])
 *   },
 * })
 * ```
 *
 * `'dashboard.more'` is parsed as menu `dashboard`, group `more` (split on the *first* dot only).
 */
export function extendMenu(nuxt: Nuxt, path: string, items: MenuItem | MenuItem[]): void {
  const { menu, group, wildcard } = parseMenuPath(path)
  if (wildcard) {
    throw new Error(`[@frigear-nu/menu] Cannot register items into wildcard path "${path}" - wildcards are only supported when reading a menu via \`useMenu\`.`)
  }
  const normalized = normalizeItems(group, items)

  nuxt.options.menus ||= {}
  const extensions: Record<string, Record<string, MenuItem[]>> = nuxt.options.menus._extensions ||= {}
  const groups = extensions[menu] ||= {}
  const list = groups[group] ||= []
  list.push(...normalized)

  nuxt.callHook('menus:extend', menu, normalized)
}

/**
 * A typed identity helper for authoring a module's `runtime/menus.ts` source file. It exists
 * purely for type inference/DX - it returns the function unchanged.
 *
 * ```ts
 * // runtime/menus.ts
 * export default defineMenuSource((items) => {
 *   const config = useRuntimeConfig().public.example
 *   if (config?.enabled) items.push({ label: 'Example', to: '/example' })
 * })
 * ```
 */
export const defineMenuSource = (source: MenuSource): MenuSource => source

export type RegisterMenuSourceOptions = {
  /** Resolved path to the module's `runtime/menus.ts` source file. */
  file: string
  /** Menu this source's root group items are pushed into. */
  menu: string
}

/**
 * Registers a module's menu source so `@frigear-nu/menu` runs it alongside every other
 * registered source, merging the result into the named menu. Modules call this once during their
 * own `setup()` - registration order doesn't matter, since sources are only resolved once every
 * module has finished setting up. `options.file` must already be a resolved path (for example via
 * `createResolver(import.meta.url).resolve(...)`).
 */
export const registerMenuSource = (nuxt: Nuxt, options: RegisterMenuSourceOptions): void => {
  nuxt.options.menus ||= {}

  const sources: Array<{ menu: string, file: string }> = Array.isArray(nuxt.options.menus._sources)
    ? nuxt.options.menus._sources
    : []
  nuxt.options.menus._sources = sources

  if (!sources.some(source => source.menu === options.menu && source.file === options.file)) {
    sources.push({ menu: options.menu, file: options.file })
  }
}
