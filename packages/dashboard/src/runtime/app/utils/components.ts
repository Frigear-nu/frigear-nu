import { defineAsyncComponent, markRaw, type Component } from 'vue'
// The widget registry of `@frigear-nu/widget` (a hard dependency): items are widgets of the area `dashboard.<name>`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { widgets as registry } from '#widgets/registry'
import { dashboardArea } from '../../shared/registry'

const cache = new Map<string, Component>()

/** The lazily loaded component of a dashboard item. */
export function getDashboardComponent(name: string, id: string): Component | undefined {
  const area = dashboardArea(name)
  const key = `${area}::${id}`
  if (!cache.has(key)) {
    const widget = (registry[area] ?? []).find((item: { id: string }) => item.id === id)
    if (!widget) return undefined
    cache.set(key, markRaw(defineAsyncComponent(widget.component)))
  }
  return cache.get(key)
}
