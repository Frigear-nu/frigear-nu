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
  tags?: string[]
  meta?: Record<string, unknown>
}

/** A registered widget with its area and a guaranteed `id`. */
export type RegisteredWidget = WidgetDefinition & { id: string, area: string }

/** What `useWidgets` returns: everything but the component, which is resolved by `<WidgetArea>`. */
export type WidgetMeta = Omit<RegisteredWidget, 'component'>

export type ModuleOptions = Record<string, never>
