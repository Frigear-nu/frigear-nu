import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { deriveWidgetId, extendWidgets, sortWidgets } from '../src/runtime/utils/widget'

const createNuxt = () => ({ options: {}, callHook: vi.fn() }) as unknown as Nuxt & { options: { widgets?: { _extensions?: Record<string, { id: string, order?: number }[]> } } }

describe('deriveWidgetId', () => {
  it('uses the explicit id, else the component file name', () => {
    expect(deriveWidgetId({ id: 'x', component: '/a/B.vue' })).toBe('x')
    expect(deriveWidgetId({ component: '/a/NewUsers.vue' })).toBe('NewUsers')
  })
})

describe('sortWidgets', () => {
  it('orders by `order` ascending, unordered last in registration order', () => {
    const sorted = sortWidgets([{ id: 'c' }, { id: 'b', order: 2 }, { id: 'a', order: 1 }, { id: 'd' }])
    expect(sorted.map(w => w.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('extendWidgets', () => {
  it('registers widgets per area and announces them', () => {
    const nuxt = createNuxt()
    extendWidgets(nuxt, 'admin.dashboard', { component: '/a/One.vue', order: 1 })
    extendWidgets(nuxt, 'admin.dashboard', [{ component: '/a/Two.vue' }])
    expect(nuxt.options.widgets?._extensions?.['admin.dashboard']?.map(w => w.id)).toEqual(['One', 'Two'])
    expect(nuxt.callHook).toHaveBeenCalledTimes(2)
  })

  it('replaces a widget registered again under the same id', () => {
    const nuxt = createNuxt()
    extendWidgets(nuxt, 'a', { id: 'x', component: '/a/One.vue', order: 1 })
    extendWidgets(nuxt, 'a', { id: 'x', component: '/b/Other.vue', order: 5 })
    expect(nuxt.options.widgets?._extensions?.a).toHaveLength(1)
    expect(nuxt.options.widgets?._extensions?.a?.[0]?.order).toBe(5)
  })
})
