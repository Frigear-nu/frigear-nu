import { describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendDashboard, getDashboardItems } from '../../src/runtime/utils/dashboard'
import { dashboardRegistryTemplate, isModuleConditionMet, resolveDashboardRegistry } from '../../src/runtime/shared/registry'
import { resolveHomeTab } from '../../src/runtime/shared/home-tab'

type Options = { widgets?: { _extensions?: Record<string, { id: string, order?: number, title?: string, props?: unknown }[]> } }
const createNuxt = () => ({ options: {}, callHook: vi.fn() }) as unknown as Nuxt & { options: Options }

describe('extendDashboard', () => {
  it('registers the widget part into `dashboard.<name>` and keeps the rest in the dashboard registry', () => {
    const nuxt = createNuxt()
    extendDashboard(nuxt, 'crew.home', {
      id: 'shifts.next',
      component: '/a/NextShift.vue',
      order: 10,
      span: 2,
      props: { limit: 3 },
      permission: 'shifts:read',
      title: 'Next shift',
      titleKey: 'shifts.dashboard.next',
      platforms: ['web', 'mobile'],
      when: { module: '@frigear-nu/shifts' },
    })

    const widgets = nuxt.options.widgets?._extensions?.['dashboard.crew.home']
    expect(widgets).toHaveLength(1)
    expect(widgets?.[0]).toMatchObject({ id: 'shifts.next', order: 10, span: 2, props: { limit: 3 }, permission: 'shifts:read', area: 'dashboard.crew.home' })
    // The dashboard-only fields do not leak into the widget registry.
    expect(widgets?.[0]).not.toHaveProperty('title')
    expect(widgets?.[0]).not.toHaveProperty('platforms')

    expect(getDashboardItems(nuxt)['crew.home']).toEqual([{
      id: 'shifts.next',
      title: 'Next shift',
      titleKey: 'shifts.dashboard.next',
      platforms: ['web', 'mobile'],
      when: { module: '@frigear-nu/shifts' },
    }])
    expect(nuxt.callHook).toHaveBeenCalledWith('widgets:extend', 'dashboard.crew.home', expect.any(Array))
  })

  it('derives the id from the component, accepts a list and keeps dashboards apart', () => {
    const nuxt = createNuxt()
    extendDashboard(nuxt, 'crew.home', [{ component: '/a/One.vue' }, { component: '/a/Two.vue', order: 1 }])
    extendDashboard(nuxt, 'admin.overview', { component: '/a/One.vue' })
    expect(getDashboardItems(nuxt)['crew.home']?.map(entry => entry.id)).toEqual(['One', 'Two'])
    expect(getDashboardItems(nuxt)['admin.overview']?.map(entry => entry.id)).toEqual(['One'])
  })

  it('replaces an item registered again under the same id, in both registries', () => {
    const nuxt = createNuxt()
    extendDashboard(nuxt, 'crew.home', { id: 'x', component: '/a/One.vue', title: 'First' })
    extendDashboard(nuxt, 'crew.home', { id: 'x', component: '/b/Other.vue', title: 'Second', order: 5 })
    expect(getDashboardItems(nuxt)['crew.home']).toEqual([{ id: 'x', title: 'Second' }])
    expect(nuxt.options.widgets?._extensions?.['dashboard.crew.home']).toHaveLength(1)
    expect(nuxt.options.widgets?._extensions?.['dashboard.crew.home']?.[0]?.order).toBe(5)
  })

  it('needs a dashboard name', () => {
    expect(() => extendDashboard(createNuxt(), '', { component: '/a/One.vue' })).toThrow(/dashboard name/)
  })
})

describe('when.module', () => {
  const installed = new Set(['@frigear-nu/shifts'])
  const hasModule = (name: string) => installed.has(name)

  it('holds without a module condition, or when the module is installed', () => {
    expect(isModuleConditionMet({}, hasModule)).toBe(true)
    expect(isModuleConditionMet({ when: { platform: 'web' } }, hasModule)).toBe(true)
    expect(isModuleConditionMet({ when: { module: '@frigear-nu/shifts' } }, hasModule)).toBe(true)
    expect(isModuleConditionMet({ when: { module: '@frigear-nu/maps' } }, hasModule)).toBe(false)
  })

  it('drops the items of absent modules from the registry', () => {
    const resolved = resolveDashboardRegistry({
      'crew.home': [
        { id: 'plain' },
        { id: 'shifts', when: { module: '@frigear-nu/shifts' } },
        { id: 'maps', when: { module: '@frigear-nu/maps', platform: 'mobile' } },
      ],
    }, hasModule)
    expect(resolved['crew.home']?.map(entry => entry.id)).toEqual(['plain', 'shifts'])
  })

  it('writes the registry keyed by dashboard, then id', () => {
    const source = dashboardRegistryTemplate({ 'crew.home': [{ id: 'a', title: 'A' }] })
    expect(source).toBe('export const dashboards = {"crew.home":{"a":{"id":"a","title":"A"}}}\n')
  })
})

describe('resolveHomeTab', () => {
  it('registers nothing without mobile, or when turned off', () => {
    expect(resolveHomeTab({ dashboard: 'crew.home' }, { mobile: false })).toBeUndefined()
    expect(resolveHomeTab(false, { mobile: true })).toBeUndefined()
  })

  it('defaults to the crew.home dashboard at /crew', () => {
    expect(resolveHomeTab(undefined, { mobile: true })).toEqual({
      dashboard: 'crew.home',
      path: '/crew',
      tab: { id: 'home', to: '/crew', label: 'Home', labelKey: 'dashboard.home.label', icon: 'i-lucide-house', sfSymbol: 'house', requiresAuth: true, order: 0 },
    })
  })

  it('takes the host options, and keeps a custom label untranslated', () => {
    const home = resolveHomeTab({ dashboard: 'me', path: 'start', label: 'Start', icon: 'i-lucide-star' }, { mobile: true })
    expect(home?.dashboard).toBe('me')
    expect(home?.path).toBe('/start')
    expect(home?.tab).toMatchObject({ to: '/start', label: 'Start', icon: 'i-lucide-star' })
    expect(home?.tab).not.toHaveProperty('labelKey')
  })
})
