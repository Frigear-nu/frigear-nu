import { defineAsyncComponent, markRaw, type AsyncComponentLoader, type Component } from 'vue'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { tabs as registry } from '#widgets/tabs'

const cache = new Map<string, Component>()

/** The (lazily loaded) component of a registered tab. */
export function getTabComponent(area: string, id: string): Component | undefined {
  const key = `${area}::${id}`
  if (!cache.has(key)) {
    const tabs = (registry[area] ?? []) as Array<{ id: string, component: AsyncComponentLoader }>
    const tab = tabs.find(item => item.id === id)
    if (!tab) return undefined
    cache.set(key, markRaw(defineAsyncComponent(tab.component)))
  }
  return cache.get(key)
}
