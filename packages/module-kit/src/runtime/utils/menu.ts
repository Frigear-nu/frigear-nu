import { hasNuxtModule } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

export interface MenuSourceOptions {
  /** The menu the items belong to, for example `dashboard.account`. */
  menu: string
  /** Absolute path of the source file (`defineMenuSource` default export), for example from `resolver.resolve('./runtime/menus')`. */
  file: string
}

type MenuSources = { menus?: { _sources?: MenuSourceOptions[] } }

/** Registers a menu source file with `@frigear-nu/menu`. The menu module reads them once every module is done. */
export function addMenuSource(nuxt: Nuxt, options: MenuSourceOptions): void {
  const host = nuxt.options as unknown as MenuSources
  host.menus ||= {}

  const sources = Array.isArray(host.menus._sources) ? host.menus._sources : []
  host.menus._sources = sources

  if (!sources.some(source => source.menu === options.menu && source.file === options.file)) {
    sources.push({ menu: options.menu, file: options.file })
  }
}

/**
 * Registers a menu source only when `@frigear-nu/menu` is installed, so a module can contribute menu items without
 * depending on it. The source file imports `@frigear-nu/menu/utils` itself, which is only resolved when it runs.
 */
export function addOptionalMenuSource(nuxt: Nuxt, options: MenuSourceOptions): boolean {
  if (!hasNuxtModule('@frigear-nu/menu', nuxt)) return false
  addMenuSource(nuxt, options)
  return true
}
