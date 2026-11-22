import { describe, expect, it } from 'vitest'
import {
  applyLayout,
  emptyLayout,
  filterByPlatform,
  hideItem,
  isOnPlatform,
  minimalOrder,
  moveItem,
  normalizeLayout,
  orderItems,
  pruneLayout,
  resetLayout,
  setItemSettings,
  showItem,
  toggleCollapsed,
} from '../../src/runtime/shared/layout'
import { DASHBOARD_LIMITS, dashboardLayoutSchema } from '../../src/runtime/preferences'

const items = ['a', 'b', 'c', 'd'].map(id => ({ id }))
const ids = (list: { id: string }[]) => list.map(item => item.id)
/** The order a layout gives every registered item. */
const fullOrder = (layout: { order: string[] }, all: string[]) => ids(orderItems(all.map(id => ({ id })), layout.order))

describe('orderItems', () => {
  it('keeps the registered order without a saved order', () => {
    expect(ids(orderItems(items, []))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('follows the saved order and drops ids that no longer exist', () => {
    expect(ids(orderItems(items, ['d', 'gone', 'b', 'a', 'c']))).toEqual(['d', 'b', 'a', 'c'])
  })

  it('places an item missing from the saved order right after its registered predecessor', () => {
    // `c` was added by a module after the user saved [d, b, a].
    expect(ids(orderItems(items, ['d', 'b', 'a']))).toEqual(['d', 'b', 'c', 'a'])
    // A new first item stays first.
    expect(ids(orderItems(items, ['c', 'b', 'd']))).toEqual(['a', 'c', 'b', 'd'])
  })

  it('ignores duplicate ids', () => {
    expect(ids(orderItems(items, ['b', 'b', 'a']))).toEqual(['b', 'c', 'd', 'a'])
  })
})

describe('applyLayout', () => {
  it('orders, splits off the hidden items and keeps known collapsed ids', () => {
    // `b` and `d` are not in `order`: each follows its registered predecessor (`a`, `c`).
    const applied = applyLayout(items, { order: ['c', 'a'], hidden: ['a'], collapsed: ['b', 'gone'] })
    expect(ids(applied.items)).toEqual(['c', 'd', 'b'])
    expect(ids(applied.hidden)).toEqual(['a'])
    expect(applied.collapsed).toEqual(['b'])
  })

  it('treats a missing or partial layout as the default', () => {
    expect(ids(applyLayout(items, null).items)).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(applyLayout(items, { hidden: ['b'] }).items)).toEqual(['a', 'c', 'd'])
  })
})

describe('layout edits', () => {
  it('moves an item among the shown ones, clamped to the list, and stores only the moved ids', () => {
    const all = ['a', 'b', 'c']
    const first = moveItem(null, all, all, 'c', 0)
    expect(fullOrder(first, all)).toEqual(['c', 'a', 'b'])
    expect(first.order).toEqual(['c', 'a'])
    const last = moveItem(null, all, all, 'a', 99)
    expect(fullOrder(last, all)).toEqual(['b', 'c', 'a'])
    expect(last.order).toEqual(['b', 'a'])
    expect(fullOrder(moveItem(null, all, all, 'b', -5), all)).toEqual(['b', 'a', 'c'])
  })

  it('keeps a hidden item where it was', () => {
    const all = ['a', 'x', 'b']
    const layout = moveItem({ order: ['a', 'x', 'b'], hidden: ['x'], collapsed: [] }, all, ['a', 'b'], 'b', 0)
    expect(fullOrder(layout, all)).toEqual(['b', 'a', 'x'])
    expect(layout.order).toEqual(['b', 'a'])
    expect(layout.hidden).toEqual(['x'])
  })

  it('never reorders the items of the other platform', () => {
    // `m` is mobile-only: moving items on the web keeps it right after `a`, as registered.
    const all = ['a', 'm', 'b', 'c']
    const shown = ['a', 'b', 'c']
    const moved = moveItem(null, all, shown, 'c', 1)
    expect(fullOrder(moved, all)).toEqual(['a', 'm', 'c', 'b'])
    expect(moved.order).toEqual(['c', 'b'])
    const swapped = fullOrder(moveItem(null, all, shown, 'b', 2), all)
    expect(swapped).toEqual(['a', 'm', 'c', 'b'])
    expect(swapped.indexOf('m')).toBe(swapped.indexOf('a') + 1)
    // Applied on either platform with every id, the stored ids give the same order.
    expect(ids(applyLayout(shown.map(id => ({ id })), moved, all).items)).toEqual(['a', 'c', 'b'])
    expect(ids(applyLayout(['a', 'm', 'c'].map(id => ({ id })), moved, all).items)).toEqual(['a', 'm', 'c'])
  })

  it('works on a dashboard with more items than a list may hold', () => {
    const count = DASHBOARD_LIMITS.idsPerList + 10
    const all = Array.from({ length: count }, (_, index) => `item-${index}`)
    let layout = moveItem(null, all, all, `item-${count - 1}`, 0)
    layout = moveItem(layout, all, fullOrder(layout, all), 'item-10', 40)
    expect(layout.order.length).toBeLessThanOrEqual(6)
    expect(dashboardLayoutSchema.safeParse(layout).success).toBe(true)
    const order = fullOrder(layout, all)
    expect(order[0]).toBe(`item-${count - 1}`)
    expect(order[40]).toBe('item-10')
    expect(order).toHaveLength(count)
  })

  it('stores the fewest ids that give back the same order', () => {
    const registered = ['a', 'b', 'c', 'd', 'e', 'f']
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let run = 0; run < 200; run++) {
      const full = [...registered].sort(() => random() - 0.5)
      const stored = minimalOrder(registered, full)
      expect(ids(orderItems(registered.map(id => ({ id })), stored))).toEqual(full)
    }
    expect(minimalOrder(registered, registered)).toEqual([])
  })

  it('leaves the layout as it is for an unknown id', () => {
    expect(moveItem({ order: ['a'], hidden: [], collapsed: [] }, ['a'], ['a'], 'zz', 0).order).toEqual(['a'])
  })

  it('prunes ids that are not items of the dashboard', () => {
    const pruned = pruneLayout({ order: ['a', 'gone', 'a'], hidden: ['old'], collapsed: ['b'], settings: { gone: { x: 1 } } }, ['a', 'b'])
    expect(pruned).toEqual({ order: ['a'], hidden: [], collapsed: ['b'] })
  })

  it('hides and shows an item once', () => {
    const hidden = hideItem(hideItem(null, 'a'), 'a')
    expect(hidden.hidden).toEqual(['a'])
    expect(showItem(hidden, 'a').hidden).toEqual([])
  })

  it('toggles collapsed', () => {
    const once = toggleCollapsed(null, 'b')
    expect(once.collapsed).toEqual(['b'])
    expect(toggleCollapsed(once, 'b').collapsed).toEqual([])
  })

  it('sets and clears item settings', () => {
    const set = setItemSettings(null, 'a', { range: 7 })
    expect(set.settings).toEqual({ a: { range: 7 } })
    expect(setItemSettings(set, 'a', {}).settings).toBeUndefined()
  })

  it('never mutates its input', () => {
    const layout = { order: ['a'], hidden: ['b'], collapsed: ['c'], settings: { a: { x: 1 } } }
    const copy = structuredClone(layout)
    moveItem(layout, ['a', 'b', 'c'], ['a', 'c'], 'c', 0)
    pruneLayout(layout, ['a'])
    hideItem(layout, 'c')
    showItem(layout, 'b')
    toggleCollapsed(layout, 'c')
    setItemSettings(layout, 'a', {})
    expect(layout).toEqual(copy)
  })

  it('resets to the default', () => {
    expect(resetLayout()).toEqual(emptyLayout())
    expect(normalizeLayout(undefined)).toEqual({ order: [], hidden: [], collapsed: [] })
  })
})

describe('platform filter', () => {
  it('shows an item on both platforms by default', () => {
    expect(isOnPlatform({}, 'web')).toBe(true)
    expect(isOnPlatform({}, 'mobile')).toBe(true)
  })

  it('honours `platforms` and `when.platform` together', () => {
    expect(isOnPlatform({ platforms: ['mobile'] }, 'web')).toBe(false)
    expect(isOnPlatform({ when: { platform: 'web' } }, 'mobile')).toBe(false)
    expect(isOnPlatform({ platforms: ['web', 'mobile'], when: { platform: 'web' } }, 'web')).toBe(true)
    expect(isOnPlatform({ platforms: ['web'], when: { platform: 'mobile' } }, 'mobile')).toBe(false)
  })

  it('filters a list', () => {
    const list = [{ id: 'both' }, { id: 'web', platforms: ['web' as const] }, { id: 'mobile', platforms: ['mobile' as const] }]
    expect(ids(filterByPlatform(list, 'web'))).toEqual(['both', 'web'])
    expect(ids(filterByPlatform(list, 'mobile'))).toEqual(['both', 'mobile'])
  })
})
