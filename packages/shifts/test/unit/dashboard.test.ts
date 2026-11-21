import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendDashboard, getDashboardItems } from '@frigear-nu/dashboard/utils'
import { SHIFTS_DASHBOARD, shiftsDashboardItems } from '../../src/runtime/dashboard'

// The items register on `crew.home` through `extendDashboard`, without a Nuxt build: a stand-in `nuxt` collects them.
type Widget = { id: string, order?: number, permission?: string, component: string }
const createNuxt = () => ({ options: {}, callHook: vi.fn() }) as unknown as Nuxt & { options: { widgets?: { _extensions?: Record<string, Widget[]> } } }

describe('shifts dashboard items', () => {
  it('registers shifts.next, shifts.on-now, shifts.swaps on crew.home', () => {
    const nuxt = createNuxt()
    extendDashboard(nuxt, SHIFTS_DASHBOARD, shiftsDashboardItems(path => `/abs/${path}`))
    expect(SHIFTS_DASHBOARD).toBe('crew.home')
    expect(getDashboardItems(nuxt)['crew.home']).toEqual([
      { id: 'shifts.next', title: 'My next shift', titleKey: 'shifts.dashboard.next' },
      { id: 'shifts.on-now', title: 'My team on shift now', titleKey: 'shifts.dashboard.onNow' },
      { id: 'shifts.swaps', title: 'Open swaps', titleKey: 'shifts.dashboard.swaps' },
    ])
    const widgets = nuxt.options.widgets?._extensions?.['dashboard.crew.home'] ?? []
    expect(widgets.map(widget => [widget.id, widget.permission])).toEqual([
      ['shifts.next', 'shifts:read'],
      ['shifts.on-now', 'shifts:read'],
      ['shifts.swaps', 'shifts:read'],
    ])
    // Every component is a file of this module, found through the resolver.
    expect(widgets.every(widget => widget.component.startsWith('/abs/./runtime/app/'))).toBe(true)
  })
})
