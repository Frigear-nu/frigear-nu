import { describe, expect, it } from 'vitest'
import { resolveChrome, resolveNavbarActions, usesNativeChrome, type ChromeInput } from '../../src/runtime/shared/chrome'
import { normalizeTabs } from '../../src/runtime/shared/tabs'

const { tabs } = normalizeTabs([
  { id: 'home', to: '/', label: 'Home', icon: 'i' },
  { id: 'bills', to: '/bills', label: 'Bills', title: 'Your bills', icon: 'i', requiresAuth: true },
  { id: 'about', to: '/about', label: 'About', icon: 'i' },
])

const input = (overrides: Partial<ChromeInput> = {}): ChromeInput => ({
  platform: 'web',
  nativeChrome: 'ios',
  nativeNavigation: true,
  tabs,
  path: '/',
  authenticated: true,
  overlays: 0,
  suppressed: 0,
  appName: 'Bills app',
  ...overrides,
})

describe('usesNativeChrome', () => {
  it('uses the native bars on iOS by default, on Android only with `all`, never without the plugin', () => {
    expect(usesNativeChrome('ios', 'ios', true)).toBe(true)
    expect(usesNativeChrome('android', 'ios', true)).toBe(false)
    expect(usesNativeChrome('android', 'all', true)).toBe(true)
    expect(usesNativeChrome('ios', false, true)).toBe(false)
    expect(usesNativeChrome('ios', 'ios', false)).toBe(false)
    expect(usesNativeChrome('web', 'all', true)).toBe(false)
  })
})

describe('resolveChrome', () => {
  it('selects the tab and titles the page after it', () => {
    const state = resolveChrome(input({ path: '/bills' }))
    expect(state.mode).toBe('web')
    expect(state.activeTab?.id).toBe('bills')
    expect(state.tabBar.visible).toBe(true)
    expect(state.header).toEqual({ visible: true, title: 'Your bills', largeTitle: true, back: false, actions: [] })
  })

  it('shows a back button and a small title below a tab root', () => {
    expect(resolveChrome(input({ path: '/bills/3' })).header).toMatchObject({ title: 'Your bills', largeTitle: false, back: true })
  })

  it('prefers the page title, translated', () => {
    const state = resolveChrome(input({
      path: '/bills/3',
      page: { title: 'Bill', titleKey: 'bill.title' },
      translate: (key, fallback) => (key === 'bill.title' ? 'Regning' : fallback),
    }))
    expect(state.header.title).toBe('Regning')
  })

  it('falls back to the app name off the tabs and hides the tab bar there', () => {
    const state = resolveChrome(input({ path: '/settings/profile' }))
    expect(state.activeTab).toBeNull()
    expect(state.header).toMatchObject({ title: 'Bills app', back: true })
    expect(state.tabBar.visible).toBe(false)
    expect(resolveChrome(input({ path: '/settings/profile', page: { tabBar: true } })).tabBar.visible).toBe(true)
  })

  it('hides the tab bar while an overlay is open or the bar is suppressed', () => {
    expect(resolveChrome(input({ overlays: 1 })).tabBar.visible).toBe(false)
    expect(resolveChrome(input({ suppressed: 1 })).tabBar.visible).toBe(false)
    expect(resolveChrome(input({ overlays: 1 })).header.visible).toBe(true)
  })

  it('leaves out signed-in tabs while signed out', () => {
    const state = resolveChrome(input({ authenticated: false, path: '/bills' }))
    expect(state.tabs.map(tab => tab.id)).toEqual(['home', 'about'])
    expect(state.activeTab).toBeNull()
    expect(state.header.title).toBe('Bills app')
    expect(resolveChrome(input({ authenticated: null })).tabs).toHaveLength(3)
  })

  it('honours page meta: no navbar, no tab bar, a chosen tab', () => {
    expect(resolveChrome(input({ page: { navbar: false } })).header.visible).toBe(false)
    expect(resolveChrome(input({ page: { tabBar: false } })).tabBar.visible).toBe(false)
    expect(resolveChrome(input({ path: '/x', page: { tab: 'bills' } })).activeTab?.id).toBe('bills')
  })

  it('picks native mode on iOS', () => {
    expect(resolveChrome(input({ platform: 'ios' })).mode).toBe('native')
  })
})

describe('navbar actions', () => {
  const settings = { id: 'settings', label: 'Settings', labelKey: 'nav.settings', icon: 'i-lucide-settings', sfSymbol: 'gearshape', to: '/settings' }

  it('folds page meta actions into the header, translated and placed right by default', () => {
    const state = resolveChrome(input({
      page: { actions: [settings, { id: 'help', label: 'Help', placement: 'left' }] },
      translate: (key, fallback) => (key === 'nav.settings' ? 'Indstillinger' : fallback),
    }))
    expect(state.header.actions).toEqual([
      { ...settings, label: 'Indstillinger', placement: 'right' },
      { id: 'help', label: 'Help', placement: 'left' },
    ])
  })

  it('adds composable actions after the page meta ones, a repeated id replacing the earlier one in place', () => {
    const onSelect = () => {}
    const state = resolveChrome(input({
      page: { actions: [settings, { id: 'share', label: 'Share' }] },
      actions: [{ id: 'settings', label: 'Preferences', onSelect }, { id: 'add', label: 'Add' }],
    }))
    expect(state.header.actions.map(action => [action.id, action.label])).toEqual([['settings', 'Preferences'], ['share', 'Share'], ['add', 'Add']])
    expect(state.header.actions[0]!.onSelect).toBe(onSelect)
  })

  it('has none when the page sets none, and skips actions without an id', () => {
    expect(resolveChrome(input()).header.actions).toEqual([])
    expect(resolveNavbarActions([undefined, [{ id: '', label: 'Nameless' }]])).toEqual([])
  })
})

describe('splash screen', () => {
  it('hides the navbar and tab bar while it is up', () => {
    const state = resolveChrome(input({ splash: true }))
    expect(state.header.visible).toBe(false)
    expect(state.tabBar.visible).toBe(false)
    expect(resolveChrome(input({ splash: false })).tabBar.visible).toBe(true)
  })
})
