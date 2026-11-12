import type { MenuFilterContext, MenuItem, ModuleOptions } from './types'

export type ResolvedMenuContentSource = { collection: string, field: string }

declare module '@nuxt/schema' {
  interface NuxtConfig {
    menus?: ModuleOptions
  }

  interface NuxtOptions {
    menus?: ModuleOptions & {
      _extensions?: Record<string, Record<string, MenuItem[]>>
      _sources?: Array<{ menu: string, file: string }>
    }
  }

  interface PublicRuntimeConfig {
    menus?: {
      content?: Record<string, ResolvedMenuContentSource>
    }
  }

  interface NuxtHooks {
    /** Called every time `extendMenu` registers items into a menu. */
    'menus:extend': (menu: string, items: MenuItem[]) => void
    /**
     * Called once, after every module has finished setting up, with every menu's final
     * statically-registered items (menu name -> group -> items). Dynamic `runtime/menus.ts`
     * sources and content-sourced items aren't included, since those only resolve at render time.
     */
    'menus:resolved': (menus: Record<string, Record<string, MenuItem[]>>) => void
  }
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /** Called whenever `useMenu` resolves a menu's items, right before they're handed to a view. */
    'menus:visible': (menu: string) => void
    /**
     * Called by `useMenu` before `menus:visible`, to drop items the viewer may not see (items with a `permission`).
     * Listeners mutate `ctx.items`. The menu cache key includes the
     * `useState<number>('access:version')` counter, which the access layer bumps on sign-in/out, so menus re-filter.
     */
    'menus:filter': (ctx: MenuFilterContext) => void | Promise<void>
  }
}

export {}
