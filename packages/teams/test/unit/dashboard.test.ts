import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendDashboard, getDashboardItems } from '@frigear-nu/dashboard/utils'
import { TEAMS_DASHBOARD, teamsDashboardItems } from '../../src/runtime/dashboard'

// The items register on `crew.home` through `extendDashboard`, without a Nuxt build: a stand-in `nuxt` collects them.
type Widget = { id: string, order?: number, permission?: string, component: string }
const createNuxt = () => ({ options: {}, callHook: vi.fn() }) as unknown as Nuxt & { options: { widgets?: { _extensions?: Record<string, Widget[]> } } }

describe('teams dashboard items', () => {
  it('registers teams.mine on crew.home', () => {
    const nuxt = createNuxt()
    extendDashboard(nuxt, TEAMS_DASHBOARD, teamsDashboardItems(path => `/abs/${path}`))
    expect(TEAMS_DASHBOARD).toBe('crew.home')
    expect(getDashboardItems(nuxt)['crew.home']).toEqual([
      { id: 'teams.mine', title: 'My teams', titleKey: 'teams.dashboard.mine' },
    ])
    const widgets = nuxt.options.widgets?._extensions?.['dashboard.crew.home'] ?? []
    expect(widgets.map(widget => [widget.id, widget.permission])).toEqual([
      ['teams.mine', 'teams:read'],
    ])
    // Every component is a file of this module, found through the resolver.
    expect(widgets.every(widget => widget.component.startsWith('/abs/./runtime/app/'))).toBe(true)
  })
})
