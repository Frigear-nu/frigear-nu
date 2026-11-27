import type { ModuleDependencyMeta, Nuxt } from '@nuxt/schema'
import type {} from '../../schema'

/** Modules that make the app they are installed in a client-only one: a static build with no server of its own. */
const CLIENT_ONLY_MODULES = ['@frigear-nu/mobile']

// On the Nuxt instance under a registered symbol, so every copy of this package (Nuxt loads modules with jiti) sees it.
const MARK = Symbol.for('@frigear-nu/module-kit:client-only')
type Marked = Nuxt & { [MARK]?: true }

/** The package name of a `nuxt.options.modules` entry (`'@scope/name'`, `['@scope/name', options]`), else `undefined`. */
const moduleName = (entry: unknown): string | undefined => {
  const value = Array.isArray(entry) ? entry[0] : entry
  return typeof value === 'string' ? value : undefined
}

/**
 * Whether the app is client only: a static build (`nuxt generate`) that runs without a server of its own and calls a
 * remote API, such as a Capacitor app on `@frigear-nu/mobile`. Modules then leave out what only a server uses (server
 * routes, Nitro plugins and tasks, database tables, server policies, the `@nuxthub/core` dependency) and keep what
 * their pages need (pages, components, composables, i18n, menus, widgets, tabs, permissions, public runtime config).
 *
 * `moduleKit.clientOnly` in the app's config decides when set. Otherwise an app is client only when it lists
 * `@frigear-nu/mobile` in `modules`, or a module marked it (`markClientOnlyApp`). Module dependencies are picked before
 * any module's `setup()` runs, so `moduleDependencies` can only see the config and the `modules` list: an app that
 * installs mobile some other way (a layer) sets `moduleKit.clientOnly: true`.
 */
export function isClientOnlyApp(nuxt: Nuxt): boolean {
  const options = nuxt.options.moduleKit
  if (options && typeof options.clientOnly === 'boolean') return options.clientOnly
  if ((nuxt as Marked)[MARK]) return true
  return (nuxt.options.modules ?? []).some(entry => CLIENT_ONLY_MODULES.includes(moduleName(entry) ?? ''))
}

/** Marks the app client only (see `isClientOnlyApp`), unless its config set `moduleKit.clientOnly: false`. */
export function markClientOnlyApp(nuxt: Nuxt): void {
  (nuxt as Marked)[MARK] = true
}

/**
 * `dependencies` in a server app, nothing in a client-only one (see `isClientOnlyApp`). For the server-only entries of
 * a module's `moduleDependencies`, such as `@nuxthub/core`:
 *
 * ```ts
 * moduleDependencies: nuxt => ({
 *   ...serverModuleDependencies(nuxt, { '@nuxthub/core': { version: '>=0.10' } }),
 *   '@frigear-nu/ui': { version: '>=0.0.1' },
 * }),
 * ```
 */
export function serverModuleDependencies(nuxt: Nuxt, dependencies: Record<string, ModuleDependencyMeta>): Record<string, ModuleDependencyMeta> {
  return isClientOnlyApp(nuxt) ? {} : dependencies
}
