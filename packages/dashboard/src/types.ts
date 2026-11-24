import type { WidgetDefinition } from '@frigear-nu/widget/utils'

/** Where the app runs: `mobile` inside the Capacitor shell of `@frigear-nu/mobile`, `web` everywhere else. */
export type DashboardPlatform = 'web' | 'mobile'

/** A serialisable condition: every key that is set must hold. */
export interface DashboardItemCondition {
  /** The item ships only when this Nuxt module is installed (decided at build time). */
  module?: string
  /** The item shows only on this platform. */
  platform?: DashboardPlatform
}

/**
 * An item of a named dashboard: a widget (`@frigear-nu/widget`) plus a title and where it shows. Everything except
 * `component` must be serialisable, it is written into the build.
 */
export type DashboardItem = WidgetDefinition & {
  /** Plain fallback title. */
  title?: string
  /** i18n key of the title, translated at render time when `@nuxtjs/i18n` has it. */
  titleKey?: string
  /** The platforms the item shows on. Default: both. */
  platforms?: DashboardPlatform[]
  when?: DashboardItemCondition
}

/** What `#dashboard/registry` keeps of an item, next to the widget registry. */
export interface DashboardRegistryEntry {
  id: string
  title?: string
  titleKey?: string
  platforms?: DashboardPlatform[]
  when?: DashboardItemCondition
}

/** One user's layout of one dashboard. Ids that no longer exist are ignored. */
export interface DashboardLayout {
  /** Item ids in the user's order. Items missing from it keep their registered place. */
  order: string[]
  hidden: string[]
  collapsed: string[]
  /** Per-item settings, by item id (`useDashboardItem().settings`). */
  settings?: Record<string, Record<string, unknown>>
}

/** What `GET` and `PATCH /api/dashboard/me/layouts` answer: the caller's layouts by dashboard name. */
export interface DashboardLayoutsDto {
  layouts: Record<string, DashboardLayout>
}

/** The Home tab of `@frigear-nu/mobile`. */
export interface DashboardHomeTabOptions {
  /** The dashboard the tab renders. Default `crew.home`. */
  dashboard?: string
  /** The page path of the tab. Default `/crew`. */
  path?: string
  /** Tab label. Default `Home` (translated through `dashboard.home.label`). */
  label?: string
  /** Nuxt UI icon of the web tab bar. Default `i-lucide-house`. */
  icon?: string
}

/** The pages of the signed-in hub. */
export interface DashboardPagesOptions {
  /**
   * The hub: a signed-in page with shortcuts to the areas of the `dashboard` menu and the `settings.home.dashboard`
   * dashboard, in the `dashboard` layout. A path, `true` for `/dashboard` (the default), or `false` to turn the area
   * off. Needs `@frigear-nu/auth`.
   */
  home?: string | boolean
}

export interface DashboardSettings {
  pages?: DashboardPagesOptions
  home?: {
    /** The dashboard the hub page renders below its shortcuts. Default `home`. */
    dashboard?: string
  }
}

export interface ModuleOptions {
  settings?: DashboardSettings
  /**
   * With `@frigear-nu/mobile`: a Home tab and a page at `path` rendering `<Dashboard :name>`. `false` turns it off.
   * Without mobile nothing is registered: a web app places `<Dashboard>` on a page itself.
   */
  homeTab?: DashboardHomeTabOptions | false
}

export interface DashboardPublicConfig {
  /** The dashboard the Home tab page renders, `''` without one. */
  home: string
  pages: {
    /** The hub's path, unset when the area is off. */
    home?: string
  }
  /** The dashboard the hub page renders, `''` when the area is off. */
  homeDashboard: string
}
