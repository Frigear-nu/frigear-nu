import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveChrome, type ChromeInput } from '../../src/runtime/shared/chrome'
import { createNativeNavigationController } from '../../src/runtime/shared/native-navigation'
import type { NativeNavigationPluginLike } from '../../src/runtime/shared/native'
import { createPullToRefresh, runRefreshHandlers, wantsPullToRefresh } from '../../src/runtime/shared/pull-to-refresh'
import { normalizeTabs } from '../../src/runtime/shared/tabs'

const { tabs } = normalizeTabs([
  { id: 'home', to: '/', label: 'Home', icon: 'i' },
  { id: 'bills', to: '/bills', label: 'Bills', icon: 'i' },
])

const chrome = (overrides: Partial<ChromeInput> = {}) => resolveChrome({
  platform: 'ios', nativeChrome: 'ios', nativeNavigation: true, tabs, path: '/', authenticated: true,
  overlays: 0, suppressed: 0, appName: 'App', pullToRefresh: true, ...overrides,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('wantsPullToRefresh', () => {
  it('is on for every page when the app turns it on; page meta wins', () => {
    expect(wantsPullToRefresh(true, undefined)).toBe(true)
    expect(wantsPullToRefresh(false, undefined)).toBe(false)
    expect(wantsPullToRefresh(undefined, undefined)).toBe(false)
    expect(wantsPullToRefresh(true, false)).toBe(false)
    expect(wantsPullToRefresh(false, true)).toBe(true)
  })
})

describe('resolveChrome pullToRefresh', () => {
  it('is on for every page, off by page meta, overlays and the splash screen', () => {
    expect(chrome().pullToRefresh).toBe(true)
    expect(chrome({ path: '/bills' }).pullToRefresh).toBe(true)
    expect(chrome({ path: '/bills/42' }).pullToRefresh).toBe(true)
    expect(chrome({ path: '/elsewhere' }).pullToRefresh).toBe(true)
    expect(chrome({ path: '/bills/42', page: { pullToRefresh: false } }).pullToRefresh).toBe(false)
    expect(chrome({ page: { pullToRefresh: false } }).pullToRefresh).toBe(false)
    expect(chrome({ pullToRefresh: false }).pullToRefresh).toBe(false)
    expect(chrome({ overlays: 1 }).pullToRefresh).toBe(false)
    expect(chrome({ splash: true }).pullToRefresh).toBe(false)
  })
})

describe('createPullToRefresh', () => {
  it('runs the refresh, then ends the spinner', async () => {
    const order: string[] = []
    const runner = createPullToRefresh({
      onStart: () => order.push('start'),
      refresh: async () => {
        order.push('refresh')
      },
      end: () => order.push('end'),
    })
    await runner.pull()
    expect(order).toEqual(['start', 'refresh', 'end'])
    expect(runner.running).toBe(false)
  })

  it('ends the spinner when the refresh fails, and when it hangs past the timeout', async () => {
    const end = vi.fn()
    await createPullToRefresh({ refresh: () => Promise.reject(new Error('offline')), end }).pull()
    expect(end).toHaveBeenCalledTimes(1)

    vi.useFakeTimers()
    const hanging = createPullToRefresh({ refresh: () => new Promise(() => {}), end, timeout: 500 })
    const pulled = hanging.pull()
    await vi.advanceTimersByTimeAsync(499)
    expect(end).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await pulled
    expect(end).toHaveBeenCalledTimes(2)
  })

  it('joins a pull that comes while one runs', async () => {
    let finish!: () => void
    const refresh = vi.fn(() => new Promise<void>(resolve => (finish = resolve)))
    const end = vi.fn()
    const runner = createPullToRefresh({ refresh, end })
    const first = runner.pull()
    const second = runner.pull()
    expect(first).toBe(second)
    expect(runner.running).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    finish()
    await first
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('ignores a failing start haptic and a failing end', async () => {
    const refresh = vi.fn()
    await expect(createPullToRefresh({ onStart: () => Promise.reject(new Error('no haptics')), refresh, end: () => Promise.reject(new Error('old plugin')) }).pull()).resolves.toBeUndefined()
    expect(refresh).toHaveBeenCalled()
  })
})

describe('runRefreshHandlers', () => {
  it('runs every handler at once and waits for all, failures included', async () => {
    const done: string[] = []
    await runRefreshHandlers([
      async () => {
        await new Promise(resolve => setTimeout(resolve, 5))
        done.push('slow')
      },
      () => {
        throw new Error('boom')
      },
      () => done.push('fast'),
    ])
    expect(done.sort()).toEqual(['fast', 'slow'])
  })
})

describe('native navigation controller pull to refresh', () => {
  function mockPlugin() {
    const calls: [string, unknown?][] = []
    const listeners: Record<string, () => void> = {}
    const plugin: NativeNavigationPluginLike = {
      configure: vi.fn(async () => {}),
      setNavbar: vi.fn(async () => {}),
      setTabbar: vi.fn(async () => {}),
      setPullToRefresh: vi.fn(async (options) => {
        calls.push(['setPullToRefresh', options])
      }),
      endPullToRefresh: vi.fn(async () => {
        calls.push(['endPullToRefresh'])
      }),
      addListener: vi.fn(async (event: string, listener: () => void) => {
        listeners[event] = listener
        return { remove: vi.fn(async () => {}) }
      }) as NativeNavigationPluginLike['addListener'],
    }
    return { plugin, calls, listeners }
  }
  const colors = { foreground: '#000000' }

  it('turns pull to refresh on and off as the page changes, only when it changes', async () => {
    const { plugin, calls } = mockPlugin()
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn(), onPullToRefresh: vi.fn() })
    await controller.apply(chrome(), colors)
    await controller.apply(chrome({ path: '/bills/42' }), colors)
    await controller.apply(chrome({ path: '/bills/42/edit', page: { pullToRefresh: false } }), colors)
    await controller.apply(chrome({ path: '/bills/42/edit', page: { pullToRefresh: false }, overlays: 1 }), colors)
    await controller.apply(chrome({ path: '/bills' }), colors)
    expect(calls).toEqual([
      ['setPullToRefresh', { enabled: true }],
      ['setPullToRefresh', { enabled: false }],
      ['setPullToRefresh', { enabled: true }],
    ])
  })

  it('refreshes on a pull, then ends the spinner', async () => {
    const { plugin, calls, listeners } = mockPlugin()
    const onPullToRefresh = vi.fn(async () => {
      calls.push(['refresh'])
    })
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn(), onPullToRefresh })
    await controller.start()
    await controller.apply(chrome(), colors)
    listeners.pullToRefresh!()
    await vi.waitFor(() => expect(calls.at(-1)).toEqual(['endPullToRefresh']))
    expect(calls.slice(-2)).toEqual([['refresh'], ['endPullToRefresh']])
  })

  it('leaves pull to refresh off without a handler or plugin support, and survives a native side without it', async () => {
    const { plugin, calls, listeners } = mockPlugin()
    const controller = createNativeNavigationController({ plugin, onSelectTab: vi.fn(), onBack: vi.fn() })
    await controller.start()
    await controller.apply(chrome(), colors)
    expect(calls).toEqual([])
    expect(listeners.pullToRefresh).toBeUndefined()

    const old = mockPlugin()
    old.plugin.setPullToRefresh = vi.fn(async () => {
      throw new Error('not implemented')
    })
    const controller2 = createNativeNavigationController({ plugin: old.plugin, onSelectTab: vi.fn(), onBack: vi.fn(), onPullToRefresh: vi.fn() })
    await expect(controller2.apply(chrome(), colors)).resolves.toBeUndefined()
    expect(old.plugin.setNavbar).toHaveBeenCalled()
  })
})
