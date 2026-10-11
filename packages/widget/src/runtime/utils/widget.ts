import { basename, extname } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import type { RegisteredWidget, WidgetDefinition } from '../../types'

import { sortWidgets } from './sort'

export type { WidgetDefinition, RegisteredWidget } from '../../types'
export { sortWidgets }

/** Id for a widget without one: its component's file name, e.g. `NewMembers` for `.../NewMembers.vue`. */
export function deriveWidgetId(widget: Pick<WidgetDefinition, 'id' | 'component'>): string {
  return widget.id ?? basename(widget.component, extname(widget.component))
}

/**
 * Build-time API for modules to contribute widgets to a named area, without the host wiring anything. Call it
 * once during a module's own `setup()`; registration order between modules doesn't matter.
 *
 * ```ts
 * import { extendWidgets } from '@frigear-nu/widget/utils'
 *
 * extendWidgets(nuxt, 'admin.dashboard', {
 *   component: resolver.resolve('./runtime/app/widgets/NewMembers.vue'),
 *   order: 10,
 * })
 * ```
 *
 * A widget registered again under the same `id` in an area replaces the earlier one, so a host can override a
 * module's widget by registering its own after it.
 */
export function extendWidgets(nuxt: Nuxt, area: string, widgets: WidgetDefinition | WidgetDefinition[]): void {
  const normalized: RegisteredWidget[] = (Array.isArray(widgets) ? widgets : [widgets])
    .map(widget => ({ ...widget, id: deriveWidgetId(widget), area }))

  nuxt.options.widgets ||= {}
  const extensions: Record<string, RegisteredWidget[]> = nuxt.options.widgets._extensions ||= {}
  const list = extensions[area] ||= []

  for (const widget of normalized) {
    const existing = list.findIndex(item => item.id === widget.id)
    if (existing === -1) list.push(widget)
    else list[existing] = widget
  }

  nuxt.callHook('widgets:extend', area, normalized)
}
