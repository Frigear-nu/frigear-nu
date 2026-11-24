import { extendPages, hasNuxtModule } from '@nuxt/kit'
import type { Nuxt, NuxtPage } from '@nuxt/schema'
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

/** Whether `path` is `base` or below it (`/dashboard/crew` is under `/dashboard`). */
export const isPathUnder = (path: string, base: string) => base === '/' || path === base || path.startsWith(`${base}/`)

/** `base` and a path below it, with one `/` between them: `joinPagePath('/dashboard', 'crew')` is `/dashboard/crew`. */
export const joinPagePath = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`

/**
 * The path of the signed-in hub of `@frigear-nu/dashboard` (its `settings.pages.home`, `/dashboard` by default), or
 * `undefined` when there is none: the module is not installed (or listed in `modules`), the hub is turned off, or
 * `@frigear-nu/auth` is missing. Modules put their signed-in areas below it (`/dashboard/crew`, `/dashboard/help`) when
 * there is one. Reads the options as the dashboard module resolves them (`resolveHub` of `@frigear-nu/dashboard`), so
 * it works from a module set up before the dashboard.
 *
 * A module that lists both modules as required `moduleDependencies` passes `{ dependency: true }`: Nuxt installs a
 * dependency after the module that asks for it, so `hasNuxtModule` cannot see it yet unless the app lists it.
 */
export function resolveDashboardHubPath(nuxt: Nuxt, options: { dependency?: boolean } = {}): string | undefined {
  if (!options.dependency && (!hasNuxtModule('@frigear-nu/dashboard', nuxt) || !hasNuxtModule('@frigear-nu/auth', nuxt))) return undefined
  const config = (nuxt.options as { dashboard?: false | { settings?: { pages?: { home?: string | boolean } } } }).dashboard
  const setting = config === false ? false : config?.settings?.pages?.home ?? true
  if (setting === false) return undefined
  const raw = typeof setting === 'string' && setting ? setting : '/dashboard'
  return (raw.startsWith('/') ? raw : `/${raw}`).replace(/(.)\/+$/, '$1')
}

export interface PageRedirectOptions {
  /** `302` (the default) keeps the old path free to come back; `301` tells browsers and search engines it moved for good. */
  statusCode?: 301 | 302 | 307 | 308
}

/**
 * Redirects pages that moved: a `redirect` route rule from each old path to its new one, under every i18n locale prefix
 * (the target gets the same prefix). Nitro answers it on the server and Nuxt follows it on client navigation. An old
 * path ending in `/**` with a target ending in `/**` keeps the rest of the path (on the server only: on the client the
 * index redirect is enough for links the app builds itself). A rule the app already set for a path keeps its own
 * `redirect`. Returns the patterns it set.
 *
 * ```ts
 * addPageRedirects(nuxt, { '/crew/status': '/dashboard/crew?tab=status' })
 * ```
 */
export function addPageRedirects(nuxt: Nuxt, redirects: Record<string, string>, options: PageRedirectOptions = {}): string[] {
  const statusCode = options.statusCode ?? 302
  const locales = (nuxt.options as { i18n?: { locales?: Array<string | { code: string }> } }).i18n?.locales ?? []
  const prefixes = ['', ...locales.map(locale => `/${typeof locale === 'string' ? locale : locale.code}`)]
  const rules = nuxt.options.routeRules ||= {}
  const set: string[] = []
  for (const [from, to] of Object.entries(redirects)) {
    if (from === to) continue
    for (const prefix of [...new Set(prefixes)]) {
      const pattern = `${prefix}${from}`
      const existing = rules[pattern]
      rules[pattern] = { ...existing, redirect: existing?.redirect ?? { to: `${prefix}${to}`, statusCode } } as (typeof rules)[string]
      set.push(pattern)
    }
  }
  return set
}
