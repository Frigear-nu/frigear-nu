import { describe, expect, it, vi } from 'vitest'
import { resolveChrome, type ChromeInput } from '../../src/runtime/shared/chrome'
import { createNativeNavigationController } from '../../src/runtime/shared/native-navigation'
import type { NativeNavigationPluginLike } from '../../src/runtime/shared/native'
import { normalizeTabs } from '../../src/runtime/shared/tabs'

// Both tabs need a user, so signed out there is no tab bar.
const { tabs } = normalizeTabs([
  { id: 'home', to: '/', label: 'Home', icon: 'i', sfSymbol: 'house', sfSymbolActive: 'house.fill', requiresAuth: true },
  { id: 'bills', to: '/bills', label: 'Bills', icon: 'i', sfSymbol: 'list.bullet', requiresAuth: true },
])

const chrome = (overrides: Partial<ChromeInput> = {}) => resolveChrome({
  platform: 'ios', nativeChrome: 'ios', nativeNavigation: true, tabs, path: '/', authenticated: true,
  overlays: 0, suppressed: 0, appName: 'App', ...overrides,
})

function mockPlugin(options: { transitions?: boolean } = {}) {
  const calls: [string, unknown][] = []
  const listeners: Record<string, (event: { id: string }) => void> = {}
  const plugin: NativeNavigationPluginLike = {
    configure: vi.fn(async (options) => {
      calls.push(['configure', options])
    }),
    setNavbar: vi.fn(async (options) => {
      calls.push(['setNavbar', options])
    }),
    setTabbar: vi.fn(async (options) => {
      calls.push(['setTabbar', options])
    }),
    addListener: vi.fn(async (event: string, listener: (event: { id: string }) => void) => {
      listeners[event] = listener
      return { remove: vi.fn(async () => {}) }
    }) as NativeNavigationPluginLike['addListener'],
  }
  if (options.transitions) {
    plugin.beginTransition = vi.fn(async (options) => {
      calls.push(['beginTransition', options])
      return { id: 't1' }
    })
    plugin.finishTransition = vi.fn(async (options) => {
      calls.push(['finishTransition', options])
    })
  }
  return { plugin, calls, listeners }
}

const colors = { foreground: '#0F172A' }

describe('native navigation controller', () => {
  it('configures CSS insets and routes native taps through onSelectTab', async () => {
    const { plugin, calls, listeners } = mockPlugin()
    const onSelectTab = vi.fn()
    const onBack = vi.fn()
    const controller = createNativeNavigationController({ plugin, onSelectTab, onBack, label: tab => tab.label.toUpperCase() })
    await controller.start()
    expect(calls[0]).toEqual(['configure', { contentInsetMode: 'css' }])

    await controller.apply(chrome(), colors)
    listeners.tabSelect!({ id: 'bills' })
    listeners.tabSelect!({ id: 'unknown' })
    listeners.navbarBack!({ id: '' })
    expect(onSelectTab).toHaveBeenCalledTimes(1)
    expect(onSelectTab.mock.calls[0]![0].id).toBe('bills')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('sets the navbar, then shows the tab bar with the selected tab and SF Symbols', async () => {
    const { plugin, calls } = mockPlugin()
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn() })
    await controller.apply(chrome(), colors)
    expect(calls).toEqual([
      ['setNavbar', { hidden: false, title: 'Home', large: true, backButton: { visible: false }, colors }],
      ['setTabbar', {
        hidden: false,
        selectedId: 'home',
        tabs: [
          { id: 'home', title: 'Home', icon: { ios: { sfSymbol: 'house' } }, selectedIcon: { ios: { sfSymbol: 'house.fill' } } },
          { id: 'bills', title: 'Bills', icon: { ios: { sfSymbol: 'list.bullet' } } },
        ],
      }],
    ])
  })

  it('skips calls for bars that did not change', async () => {
    const { plugin, calls } = mockPlugin()
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn() })
    await controller.apply(chrome(), colors)
    await controller.apply(chrome(), colors)
    expect(calls).toHaveLength(2)
    await controller.apply(chrome({ path: '/bills' }), colors)
    expect(calls.slice(2).map(([name]) => name)).toEqual(['setNavbar', 'setTabbar'])
  })

  it('hides the tab bar first while an overlay is open, and brings it back after', async () => {
    const { plugin, calls } = mockPlugin()
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn() })
    await controller.apply(chrome(), colors)
    calls.length = 0
    await controller.apply(chrome({ overlays: 1 }), colors)
    // A soft hide: the same tabs and selection, animated, so iOS keeps the tab controller.
    expect(calls).toEqual([['setTabbar', expect.objectContaining({ hidden: true, animated: true, selectedId: 'home' })]])
    expect((calls[0]![1] as { tabs: unknown[] }).tabs).toHaveLength(2)
    calls.length = 0
    await controller.apply(chrome(), colors)
    expect(calls).toEqual([['setTabbar', expect.objectContaining({ hidden: false, animated: true, selectedId: 'home' })]])
  })

  it('sends the tab bar again when a native tap does not change the route', async () => {
    const { plugin, calls, listeners } = mockPlugin()
    let release!: () => void
    const navigated = new Promise<void>(resolve => (release = resolve))
    const controller = createNativeNavigationController({ plugin, onSelectTab: () => navigated, onBack: vi.fn() })
    await controller.start()
    await controller.apply(chrome(), colors)
    calls.length = 0
    // A guard keeps the app on home: the chrome state stays the same, but the native bar selected bills.
    listeners.tabSelect!({ id: 'bills' })
    release()
    await vi.waitFor(() => expect(calls).toEqual([['setTabbar', expect.objectContaining({ hidden: false, selectedId: 'home' })]]))
  })

  it('hides signed-in tabs signed out and follows the colour mode', async () => {
    const { plugin, calls } = mockPlugin()
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn() })
    await controller.apply(chrome({ authenticated: false, path: '/login' }), colors)
    expect(calls).toEqual([
      ['setTabbar', { hidden: true }],
      ['setNavbar', { hidden: false, title: 'App', large: false, backButton: { visible: false }, colors }],
    ])
    calls.length = 0
    await controller.apply(chrome({ authenticated: false, path: '/login' }), { foreground: '#FFFFFF' })
    expect(calls).toEqual([['setNavbar', expect.objectContaining({ colors: { foreground: '#FFFFFF' } })]])
  })

  it('retries a bar whose update failed', async () => {
    const { plugin, calls } = mockPlugin()
    vi.mocked(plugin.setNavbar).mockRejectedValueOnce(new Error('busy'))
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn() })
    await expect(controller.apply(chrome(), colors)).rejects.toThrow('busy')
    await controller.apply(chrome(), colors)
    expect(calls.map(([name]) => name)).toEqual(['setNavbar', 'setTabbar'])
  })

  describe('tab switches', () => {
    // Starts on home with the bars shown, then lets each test tap a tab.
    async function started(onSelectTab: (tab: { id: string }) => unknown, options: { transitions?: boolean } = { transitions: true }) {
      const mock = mockPlugin(options)
      const controller = createNativeNavigationController({ plugin: mock.plugin, onSelectTab: tab => onSelectTab(tab) as Promise<void>, onBack: vi.fn() })
      await controller.start()
      await controller.apply(chrome(), colors)
      mock.calls.length = 0
      return { ...mock, controller }
    }

    it('crossfades: snapshot first, then the route and bars, then the fade', async () => {
      const app: { controller?: Awaited<ReturnType<typeof started>>['controller'] } = {}
      const ctx = await started(async () => {
        // The route changes while the snapshot covers the WebView.
        await app.controller!.apply(chrome({ path: '/bills' }), colors)
      })
      app.controller = ctx.controller
      ctx.listeners.tabSelect!({ id: 'bills' })
      await vi.waitFor(() => expect(ctx.calls.at(-1)?.[0]).toBe('finishTransition'))
      expect(ctx.calls.map(([name]) => name)).toEqual(['beginTransition', 'setNavbar', 'finishTransition'])
      expect(ctx.calls[0]![1]).toEqual({ direction: 'tab', duration: 180 })
      expect(ctx.calls.at(-1)![1]).toEqual({ id: 't1', direction: 'tab', duration: 180 })
    })

    it('does not send the tab bar again for the tab the user tapped', async () => {
      const app: { controller?: Awaited<ReturnType<typeof started>>['controller'] } = {}
      const ctx = await started(() => app.controller!.apply(chrome({ path: '/bills' }), colors))
      app.controller = ctx.controller
      ctx.listeners.tabSelect!({ id: 'bills' })
      await vi.waitFor(() => expect(ctx.calls.at(-1)?.[0]).toBe('finishTransition'))
      expect(ctx.calls.some(([name]) => name === 'setTabbar')).toBe(false)
      // A later change of selection that was not a tap is sent.
      await ctx.controller.apply(chrome(), colors)
      expect(ctx.calls.at(-1)).toEqual(['setTabbar', expect.objectContaining({ selectedId: 'home' })])
    })

    it('removes the snapshot and resyncs the tab bar when the navigation fails', async () => {
      const ctx = await started(() => Promise.reject(new Error('guard')))
      ctx.listeners.tabSelect!({ id: 'bills' })
      await vi.waitFor(() => expect(ctx.calls.at(-1)?.[0]).toBe('finishTransition'))
      expect(ctx.calls.map(([name]) => name)).toEqual(['beginTransition', 'setTabbar', 'finishTransition'])
      expect(ctx.calls[1]![1]).toEqual(expect.objectContaining({ selectedId: 'home' }))
    })

    it('skips the crossfade for the selected tab, and without plugin support', async () => {
      const onSelectTab = vi.fn(async () => {})
      const same = await started(onSelectTab)
      same.listeners.tabSelect!({ id: 'home' })
      await vi.waitFor(() => expect(onSelectTab).toHaveBeenCalledTimes(1))
      await same.controller.idle()
      expect(same.calls).toEqual([])

      const old = await started(onSelectTab, { transitions: false })
      old.listeners.tabSelect!({ id: 'bills' })
      await vi.waitFor(() => expect(onSelectTab).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(old.calls.map(([name]) => name)).toEqual(['setTabbar']))
    })

    it('switches without a crossfade when the duration is 0', async () => {
      const { plugin, calls, listeners } = mockPlugin({ transitions: true })
      const onSelectTab = vi.fn(async () => {})
      const controller = createNativeNavigationController({ plugin, onSelectTab, onBack: vi.fn(), tabTransitionDuration: 0 })
      await controller.start()
      await controller.apply(chrome(), colors)
      listeners.tabSelect!({ id: 'bills' })
      await vi.waitFor(() => expect(onSelectTab).toHaveBeenCalled())
      await controller.idle()
      expect(calls.some(([name]) => name === 'beginTransition')).toBe(false)
    })
  })
})
