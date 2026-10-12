import type { ModuleOptions, RegisteredTab, RegisteredWidget, TabMeta, WidgetMeta } from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    widgets?: ModuleOptions
  }

  interface NuxtOptions {
    widgets?: ModuleOptions & {
      _extensions?: Record<string, RegisteredWidget[]>
      _tabs?: Record<string, RegisteredTab[]>
    }
  }

  interface NuxtHooks {
    /** Called every time `extendWidgets` registers widgets into an area. */
    'widgets:extend': (area: string, widgets: RegisteredWidget[]) => void
    /** Called once, after every module has finished setting up, with every area's final widgets. */
    'widgets:resolved': (areas: Record<string, RegisteredWidget[]>) => void
    /** Called every time `extendTabs` registers tabs into an area. */
    'tabs:extend': (area: string, tabs: RegisteredTab[]) => void
    /** Called once, after every module has finished setting up, with every area's final tabs. */
    'tabs:resolved': (areas: Record<string, RegisteredTab[]>) => void
  }
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /**
     * Called whenever an area's widgets are resolved, before they are rendered. Remove entries from
     * `ctx.widgets` to hide them (e.g. by role, ability or feature flag using `widget.requires`).
     */
    'widgets:filter': (ctx: { area: string, widgets: WidgetMeta[], context?: Record<string, unknown> }) => void | Promise<void>
    /** Same as `widgets:filter`, for the tabs of an area (`tab.requires`). */
    'tabs:filter': (ctx: { area: string, tabs: TabMeta[], context?: Record<string, unknown> }) => void | Promise<void>
  }
}

export {}
