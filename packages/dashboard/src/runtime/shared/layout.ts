// Framework-free layout logic: applying a user's layout to the registered items, and the edits on it. Every function
// returns a new layout and never mutates its input.
import type { DashboardItemCondition, DashboardLayout, DashboardPlatform } from '../../types'

type Identified = { id: string }

/** A layout with every list present (stored layouts may lack keys). */
export function normalizeLayout(layout?: Partial<DashboardLayout> | null): DashboardLayout {
  return {
    order: [...(layout?.order ?? [])],
    hidden: [...(layout?.hidden ?? [])],
    collapsed: [...(layout?.collapsed ?? [])],
    ...(layout?.settings ? { settings: { ...layout.settings } } : {}),
  }
}

/** The default layout: the registered order, nothing hidden or collapsed. */
export const emptyLayout = (): DashboardLayout => normalizeLayout()

/**
 * The items in the user's order. Ids in `order` come first, in that order; an item missing from it (added by a module
 * after the user saved) keeps its registered place: right after the registered item before it.
 */
export function orderItems<T extends Identified>(items: T[], order: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]))
  const result: T[] = [...new Set(order)].filter(id => byId.has(id)).map(id => byId.get(id)!)
  const placed = new Set(result.map(item => item.id))

  items.forEach((item, index) => {
    if (placed.has(item.id)) return
    let at = 0
    for (let previous = index - 1; previous >= 0; previous--) {
      const found = result.findIndex(entry => entry.id === items[previous]!.id)
      if (found !== -1) {
        at = found + 1
        break
      }
    }
    result.splice(at, 0, item)
    placed.add(item.id)
  })
  return result
}

export interface AppliedLayout<T> {
  /** The items to render, in the user's order. */
  items: T[]
  /** The hidden items, in the user's order. */
  hidden: T[]
  /** Ids of the collapsed items. */
  collapsed: string[]
}

/** Orders the items and splits off the hidden ones. */
export function applyLayout<T extends Identified>(items: T[], layout?: Partial<DashboardLayout> | null): AppliedLayout<T> {
  const normalized = normalizeLayout(layout)
  const ordered = orderItems(items, normalized.order)
  const hidden = new Set(normalized.hidden)
  const ids = new Set(items.map(item => item.id))
  return {
    items: ordered.filter(item => !hidden.has(item.id)),
    hidden: ordered.filter(item => hidden.has(item.id)),
    collapsed: normalized.collapsed.filter(id => ids.has(id)),
  }
}

/**
 * Moves an item to `toIndex` among the shown items (`shown`, in their current order). The move happens inside the
 * full order of every item of the dashboard (`all`, registered order, including items hidden or filtered out by
 * platform or permission): the item lands right before or after the shown item now at `toIndex`, and every other
 * item keeps its position relative to the rest. So moving an item on the web never reorders the mobile-only items.
 */
export function moveItem(
  layout: Partial<DashboardLayout> | null | undefined,
  all: string[],
  shown: string[],
  id: string,
  toIndex: number,
): DashboardLayout {
  const normalized = normalizeLayout(layout)
  const from = shown.indexOf(id)
  if (from === -1) return normalized
  const target = shown[Math.max(0, Math.min(Math.trunc(toIndex), shown.length - 1))]!
  const full = orderItems([...new Set([...all, ...shown])].map(entry => ({ id: entry })), normalized.order).map(entry => entry.id)
  if (target === id) return { ...normalized, order: full }
  const order = full.filter(entry => entry !== id)
  const at = order.indexOf(target)
  order.splice(toIndex > from ? at + 1 : at, 0, id)
  return { ...normalized, order }
}

/** The layout without ids that are not items of the dashboard (`ids`): removed or renamed items. */
export function pruneLayout(layout: Partial<DashboardLayout> | null | undefined, ids: Iterable<string>): DashboardLayout {
  const known = new Set(ids)
  const normalized = normalizeLayout(layout)
  const keep = (list: string[]) => [...new Set(list)].filter(id => known.has(id))
  const settings = Object.fromEntries(Object.entries(normalized.settings ?? {}).filter(([id]) => known.has(id)))
  return {
    order: keep(normalized.order),
    hidden: keep(normalized.hidden),
    collapsed: keep(normalized.collapsed),
    ...(Object.keys(settings).length ? { settings } : {}),
  }
}

const without = (list: string[], id: string) => list.filter(entry => entry !== id)

export function hideItem(layout: Partial<DashboardLayout> | null | undefined, id: string): DashboardLayout {
  const normalized = normalizeLayout(layout)
  return { ...normalized, hidden: [...without(normalized.hidden, id), id] }
}

export function showItem(layout: Partial<DashboardLayout> | null | undefined, id: string): DashboardLayout {
  const normalized = normalizeLayout(layout)
  return { ...normalized, hidden: without(normalized.hidden, id) }
}

export function toggleCollapsed(layout: Partial<DashboardLayout> | null | undefined, id: string): DashboardLayout {
  const normalized = normalizeLayout(layout)
  const collapsed = normalized.collapsed.includes(id) ? without(normalized.collapsed, id) : [...normalized.collapsed, id]
  return { ...normalized, collapsed }
}

/** Replaces one item's settings; an empty object removes them. */
export function setItemSettings(layout: Partial<DashboardLayout> | null | undefined, id: string, value: Record<string, unknown>): DashboardLayout {
  const normalized = normalizeLayout(layout)
  const settings = Object.fromEntries(Object.entries(normalized.settings ?? {}).filter(([key]) => key !== id))
  if (Object.keys(value).length) settings[id] = { ...value }
  const { settings: _old, ...rest } = normalized
  return Object.keys(settings).length ? { ...rest, settings } : rest
}

/** Back to the registered default: order, hidden, collapsed and settings cleared. */
export const resetLayout = (): DashboardLayout => emptyLayout()

/** Whether an item shows on `platform`: its `platforms` (default both) and its `when.platform`. */
export function isOnPlatform(
  item: { platforms?: DashboardPlatform[], when?: DashboardItemCondition },
  platform: DashboardPlatform,
): boolean {
  if (item.platforms && !item.platforms.includes(platform)) return false
  if (item.when?.platform && item.when.platform !== platform) return false
  return true
}

export function filterByPlatform<T extends { platforms?: DashboardPlatform[], when?: DashboardItemCondition }>(items: T[], platform: DashboardPlatform): T[] {
  return items.filter(item => isOnPlatform(item, platform))
}
