import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendDashboard, getDashboardItems } from '@frigear-nu/dashboard/utils'
import { HELP_CENTER_DASHBOARD, helpCenterDashboardItems } from '../../src/runtime/dashboard'

// The items register on `crew.home` through `extendDashboard`, without a Nuxt build: a stand-in `nuxt` collects them.
type Widget = { id: string, order?: number, permission?: string, component: string }
const createNuxt = () => ({ options: {}, callHook: vi.fn() }) as unknown as Nuxt & { options: { widgets?: { _extensions?: Record<string, Widget[]> } } }

describe('help-center dashboard items', () => {
  it('registers help-center.onboarding on crew.home', () => {
    const nuxt = createNuxt()
    extendDashboard(nuxt, HELP_CENTER_DASHBOARD, helpCenterDashboardItems(path => `/abs/${path}`))
    expect(HELP_CENTER_DASHBOARD).toBe('crew.home')
    expect(getDashboardItems(nuxt)['crew.home']).toEqual([
      { id: 'help-center.onboarding', title: 'Your onboarding', titleKey: 'helpCenter.dashboard.onboarding' },
    ])
    const widgets = nuxt.options.widgets?._extensions?.['dashboard.crew.home'] ?? []
    expect(widgets.map(widget => [widget.id, widget.permission])).toEqual([
      ['help-center.onboarding', 'help-center:read'],
    ])
    // Every component is a file of this module, found through the resolver.
    expect(widgets.every(widget => widget.component.startsWith('/abs/./runtime/app/'))).toBe(true)
  })
})
