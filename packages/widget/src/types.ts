declare global {
  /** Registered permissions, generated into the app's types by `@frigear-nu/auth` (`Permission`). Empty without it. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface FrigearPermissions {}
}

/** A registered permission once `@frigear-nu/auth` generated the app's types (`Permission`), else any string. */
export type WidgetPermission = [keyof FrigearPermissions] extends [never] ? string : Extract<keyof FrigearPermissions, string>

/**
 * A widget: a Vue component a module contributes to a named area (e.g. `admin.dashboard`). The data is
 * presentation-free - the host decides how an area is laid out - and serializable, so the registry can be
 * generated at build time. Components are loaded lazily, only when their area is rendered.
 */
export type WidgetDefinition = {
  /** Stable identifier within an area; derived from the component file name when omitted. */
  id?: string
  /** Resolved path of the widget's Vue component (e.g. `resolver.resolve('./runtime/app/widgets/Foo.vue')`). */
  component: string
  /** Lower numbers render first. Widgets without an `order` render last, in registration order. */
  order?: number
  /** How many grid columns the widget spans in the default `<WidgetArea>` layout (1-4). Defaults to 1. */
  span?: 1 | 2 | 3 | 4
  /** Serializable props passed to the component. */
  props?: Record<string, unknown>
  /**
   * A free-form requirement (a role, an ability name, a feature flag...) that a `widgets:filter` listener can
   * act on to hide the widget. The widget module itself never interprets it.
   */
  requires?: string
  /**
   * The permission (`resource:action`) a viewer must hold to see the widget. Only hides it: a `widgets:filter` listener
   * (`@frigear-nu/authorization`) does the filtering, without one the widget is shown. The data behind it still checks.
   */
  permission?: WidgetPermission
  tags?: string[]
  meta?: Record<string, unknown>
}

/** A registered widget with its area and a guaranteed `id`. */
export type RegisteredWidget = WidgetDefinition & { id: string, area: string }

/** What `useWidgets` returns: everything but the component, which is resolved by `<WidgetArea>`. */
export type WidgetMeta = Omit<RegisteredWidget, 'component'>

export type ModuleOptions = Record<string, never>

/**
 * A tab: a Vue component a module contributes to a named area (e.g. `admin.users`) that the host renders with
 * `<WidgetTabs>`. Tabs live in their own registry, separate from widgets, with the same ordering and gating.
 */
export type TabDefinition = {
  /** Stable identifier within an area; derived from the component file name when omitted. Used as the `?tab=` value. */
  id?: string
  /** Resolved path of the tab's Vue component. */
  component: string
  /** Lower numbers render first. Tabs without an `order` render last, in registration order. */
  order?: number
  /** Serializable props passed to the component, next to the host's runtime `context`. */
  props?: Record<string, unknown>
  /** Plain label, used when `labelKey` is missing or can't be translated. Defaults to the id. */
  label?: string
  /** i18n key for the label, translated at render time when `@nuxtjs/i18n` is installed. */
  labelKey?: string
  /** Icon name shown next to the label (e.g. `i-lucide-credit-card`). */
  icon?: string
  /** A free-form requirement that a `tabs:filter` listener can act on; the widget module never interprets it. */
  requires?: string
  /** The permission a viewer must hold to see the tab; filtered by a `tabs:filter` listener, like `permission` of a widget. */
  permission?: WidgetPermission
  tags?: string[]
  meta?: Record<string, unknown>
}

/** A registered tab with its area and a guaranteed `id`. */
export type RegisteredTab = TabDefinition & { id: string, area: string }

/** What `useTabs` returns: everything but the component, with the label already translated. */
export type TabMeta = Omit<RegisteredTab, 'component' | 'labelKey' | 'label'> & { label: string, labelKey?: string }
