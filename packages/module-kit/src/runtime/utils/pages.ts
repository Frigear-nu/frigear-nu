import { extendPages } from '@nuxt/kit'
import type { NuxtPage } from '@nuxt/schema'
import type { createResolver } from '@nuxt/kit'

export const defineModulePage = (moduleName: string, page: NuxtPage): NuxtPage => {
  return {
    ...page,
    meta: {
      moduleName,
      ...page.meta,
    },
  }
}

/**
 * Turns an opt-in page setting into a path: a string is the custom path, `true` the default, and `false` / omitted
 * `undefined` (no page).
 */
export function resolvePagePath(setting: string | boolean | undefined, defaultPath: string): string | undefined {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export interface ModulePageDefinition {
  name: string
  /** The route path; when `undefined` the page is not registered. */
  path: string | undefined
  /** The page component, relative to the module's `resolver` (for example `./runtime/app/pages/events.vue`). */
  file: string
}

/**
 * Registers a module's pages, tagged with the module's name. A page whose path is unset, or already taken by the host
 * app or another module, is skipped, so a host can always replace a shipped page by declaring its own at that path.
 */
export function addModulePages(moduleName: string, resolver: ReturnType<typeof createResolver>, pages: ModulePageDefinition[]) {
  if (!pages.some(page => page.path)) return

  extendPages((existing) => {
    const taken = new Set(existing.map(page => page.path))
    for (const page of pages) {
      if (!page.path || taken.has(page.path)) continue
      taken.add(page.path)
      existing.push(defineModulePage(moduleName, { name: page.name, path: page.path, file: resolver.resolve(page.file) }))
    }
  })
}
