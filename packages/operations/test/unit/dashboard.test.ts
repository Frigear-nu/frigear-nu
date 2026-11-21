import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendDashboard, getDashboardItems } from '@frigear-nu/dashboard/utils'
import { OPERATIONS_DASHBOARD, operationsDashboardItems } from '../../src/runtime/dashboard'

// The items register on `crew.home` through `extendDashboard`, without a Nuxt build: a stand-in `nuxt` collects them.
type Widget = { id: string, order?: number, permission?: string, component: string }
const createNuxt = () => ({ options: {}, callHook: vi.fn() }) as unknown as Nuxt & { options: { widgets?: { _extensions?: Record<string, Widget[]> } } }

describe('operations dashboard items', () => {
  it('registers operations.upcoming on crew.home', () => {
    const nuxt = createNuxt()
    extendDashboard(nuxt, OPERATIONS_DASHBOARD, operationsDashboardItems(path => `/abs/${path}`))
    expect(OPERATIONS_DASHBOARD).toBe('crew.home')
    expect(getDashboardItems(nuxt)['crew.home']).toEqual([
      { id: 'operations.upcoming', title: 'Upcoming operations', titleKey: 'operations.dashboard.upcoming' },
    ])
    const widgets = nuxt.options.widgets?._extensions?.['dashboard.crew.home'] ?? []
    expect(widgets.map(widget => [widget.id, widget.permission])).toEqual([
      ['operations.upcoming', 'operations:read'],
    ])
    // Every component is a file of this module, found through the resolver.
    expect(widgets.every(widget => widget.component.startsWith('/abs/./runtime/app/'))).toBe(true)
  })
})
