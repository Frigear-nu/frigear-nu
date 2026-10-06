import type { Nuxt } from '@nuxt/schema'
import type { Resolver } from '@nuxt/kit'
import type { MenuItem, MenuSource } from '../../types'
import type {} from '../../schema'

export type { MenuItem, MenuSource } from '../../types'

/**
 * Splits a menu path on its *first* dot only, so `'a.b.c'` resolves to menu `'a'`, group `'b.c'`.
 * The group becomes the default group for items registered through that path - an explicit
 * `item.group` always wins.
 */
export function parseMenuPath(path: string): { menu: string, group: string } {
  const dotIndex = path.indexOf('.')
  if (dotIndex === -1) return { menu: path, group: '' }
  return { menu: path.slice(0, dotIndex), group: path.slice(dotIndex + 1) }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Deterministic id for an item missing one: its `to` if present, else a slug of its `label`. */
export function deriveMenuItemId(item: MenuItem): string {
  return item.id ?? item.to ?? slugify(item.label)
}

function normalizeItems(group: string, items: MenuItem | MenuItem[]): MenuItem[] {
  const list = Array.isArray(items) ? items : [items]
  const seen = new Set<string>()

  return list.map((item) => {
    const normalized: MenuItem = { group, ...item }
    const id = deriveMenuItemId(normalized)

    if (import.meta.dev !== false && seen.has(id)) {
      console.warn(`[@frigear-nu/menus] Duplicate menu item id "${id}" registered in the same batch.`)
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
 * import { extendMenu } from '@frigear-nu/menus/utils'
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
  const { menu, group } = parseMenuPath(path)
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
  resolver: Resolver
  file: string
  /** Menu this source's root group items are pushed into. */
  menu: string
}

/**
 * Registers a module's menu source so `@frigear-nu/menus` runs it alongside every other
 * registered source, merging the result into the named menu. Modules call this once during their
 * own `setup()` - registration order doesn't matter, since sources are only resolved once every
 * module has finished setting up.
 */
export const registerMenuSource = async (nuxt: Nuxt, options: RegisterMenuSourceOptions): Promise<void> => {
  nuxt.options.menus ||= {}

  const sources: Array<{ menu: string, file: string }> = Array.isArray(nuxt.options.menus._sources)
    ? nuxt.options.menus._sources
    : []
  nuxt.options.menus._sources = sources

  const resolved = await options.resolver.resolvePath(options.file)
  if (!sources.some(source => source.menu === options.menu && source.file === resolved)) {
    sources.push({ menu: options.menu, file: resolved })
  }
}
