import type { ModuleOptions, RegisteredWidget, WidgetMeta } from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    widgets?: ModuleOptions
  }

  interface NuxtOptions {
    widgets?: ModuleOptions & {
      _extensions?: Record<string, RegisteredWidget[]>
    }
  }

  interface NuxtHooks {
    /** Called every time `extendWidgets` registers widgets into an area. */
    'widgets:extend': (area: string, widgets: RegisteredWidget[]) => void
    /** Called once, after every module has finished setting up, with every area's final widgets. */
    'widgets:resolved': (areas: Record<string, RegisteredWidget[]>) => void
  }
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /**
     * Called whenever an area's widgets are resolved, before they are rendered. Remove entries from
     * `ctx.widgets` to hide them (e.g. by role, ability or feature flag using `widget.requires`).
     */
    'widgets:filter': (ctx: { area: string, widgets: WidgetMeta[] }) => void | Promise<void>
  }
}

export {}
