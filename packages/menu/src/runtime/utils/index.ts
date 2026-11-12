import type { MenuItem } from './menu'

// Framework-agnostic utils, safe to import from anywhere (a Nuxt module's own `setup()`, a
// `runtime/menus.ts` source file, server routes, tests, ...) - none of these touch Vue or Nuxt's
// app runtime.
export { extendMenu, defineMenuSource, registerMenuSource, parseMenuPath, deriveMenuItemId, filterMenuItems } from './menu'
export type { MenuItem, MenuSource, RegisterMenuSourceOptions, ParsedMenuPath } from './menu'

// App-runtime util - pushes directly into the client/SSR-rendered reactive menu state (see
// `../app/utils/state`), so it's only usable from code that actually runs as part of the Nuxt
// app (a `runtime/menus.ts` source, passed to `defineMenuSource`, or app code itself) - never
// from a module's own build-time `setup()` (use `extendMenu` there instead).
export { extendMenuItem } from '../app/utils/extend'

export const defineMenuItem = <T extends MenuItem>(item: T): T => item
