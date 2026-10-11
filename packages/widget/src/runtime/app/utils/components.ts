import { defineAsyncComponent, markRaw, type Component } from 'vue'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { widgets as registry } from '#widgets/registry'

const cache = new Map<string, Component>()

/** The (lazily loaded) component of a registered widget. */
export function getWidgetComponent(area: string, id: string): Component | undefined {
  const key = `${area}::${id}`
  if (!cache.has(key)) {
    const widget = (registry[area] ?? []).find((item: { id: string }) => item.id === id)
    if (!widget) return undefined
    cache.set(key, markRaw(defineAsyncComponent(widget.component)))
  }
  return cache.get(key)
}
