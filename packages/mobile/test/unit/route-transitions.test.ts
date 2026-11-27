import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveChrome } from '../../src/runtime/shared/chrome'
import type { NativeNavigationPluginLike } from '../../src/runtime/shared/native'
import { createNativeNavigationController } from '../../src/runtime/shared/native-navigation'
import { normalizeTabs } from '../../src/runtime/shared/tabs'
import { createRouteTransitionGuards, createRouteTransitions, routeTransitionDirection, type RouteSide } from '../../src/runtime/shared/route-transitions'

afterEach(() => {
  vi.useRealTimers()
})

const side = (path: string, tab?: string, tabRoot = false): RouteSide => ({ path, tab, tabRoot })

describe('routeTransitionDirection', () => {
  it('pushes within a tab, pops back up, fades across tabs', () => {
    expect(routeTransitionDirection(side('/bills', 'bills', true), side('/bills/1', 'bills'))).toBe('forward')
    expect(routeTransitionDirection(side('/bills/1', 'bills'), side('/bills/1/edit', 'bills'))).toBe('forward')
    expect(routeTransitionDirection(side('/bills/1', 'bills'), side('/bills', 'bills', true))).toBe('back')
    expect(routeTransitionDirection(side('/bills/1/edit', 'bills'), side('/bills/1', 'bills'))).toBe('back')
    expect(routeTransitionDirection(side('/bills/2', 'bills'), side('/bills/1', 'bills'), true)).toBe('back')
    expect(routeTransitionDirection(side('/bills', 'bills', true), side('/settings', 'settings', true))).toBe('tab')
    expect(routeTransitionDirection(side('/', undefined), side('/bills', 'bills', true))).toBe('tab')
    expect(routeTransitionDirection(side('/bills', 'bills', true), side('/bills', 'bills', true))).toBeUndefined()
  })

  it('treats a sibling page as a push, and the root tab like any other', () => {
    expect(routeTransitionDirection(side('/bills/1', 'bills'), side('/bills/2', 'bills'))).toBe('forward')
    expect(routeTransitionDirection(side('/', 'home', true), side('/news', 'home'))).toBe('forward')
    expect(routeTransitionDirection(side('/news', 'home'), side('/', 'home', true))).toBe('back')
  })
})

function mockPlugin() {
  const calls: [string, unknown][] = []
  let finishResolve: (() => void) | undefined
  let holdFinish = false
  const plugin: Pick<NativeNavigationPluginLike, 'beginTransition' | 'finishTransition'> = {
    beginTransition: vi.fn(async (options) => {
      calls.push(['begin', options])
      return { id: `t${calls.length}` }
    }),
    finishTransition: vi.fn((options) => {
      calls.push(['finish', options])
      if (!holdFinish) return Promise.resolve()
      return new Promise<void>(resolve => (finishResolve = resolve))
    }),
  }
  return { plugin, calls, hold: () => (holdFinish = true), release: () => finishResolve?.() }
}

describe('createRouteTransitions', () => {
  it('takes the snapshot before the route changes and slides it away once the page is ready', async () => {
    const { plugin, calls } = mockPlugin()
    const transitions = createRouteTransitions({ plugin })
    await transitions.begin('forward')
    expect(transitions.active).toBe(true)
    expect(calls).toEqual([['begin', { direction: 'forward', duration: 300 }]])
    const order: string[] = []
    await transitions.finish(async () => {
      order.push('ready')
    })
    expect(order).toEqual(['ready'])
    expect(calls[1]).toEqual(['finish', { id: 't1', direction: 'forward', duration: 300 }])
    expect(transitions.active).toBe(false)
  })

  it('fades tab navigations with their own duration', async () => {
    const { plugin, calls } = mockPlugin()
    const transitions = createRouteTransitions({ plugin, duration: 250, fadeDuration: 120 })
    await transitions.begin('tab')
    await transitions.finish(async () => {})
    expect(calls).toEqual([['begin', { direction: 'tab', duration: 120 }], ['finish', { id: 't1', direction: 'tab', duration: 120 }]])
  })

  it('keeps one snapshot through a redirect, and lets the last navigation finish it', async () => {
    const { plugin, calls } = mockPlugin()
    const transitions = createRouteTransitions({ plugin })
    await transitions.begin('forward')
    const first = transitions.finish(() => new Promise(resolve => setTimeout(resolve, 5)))
    await transitions.begin('back')
    await transitions.finish(async () => {})
    await first
    expect(calls.filter(([name]) => name === 'begin')).toHaveLength(1)
    expect(calls.filter(([name]) => name === 'finish')).toEqual([['finish', { id: 't1', direction: 'back', duration: 300 }]])
  })

  it('removes the snapshot when the page never gets ready, and after a failing ready', async () => {
    vi.useFakeTimers()
    const { plugin, calls } = mockPlugin()
    const transitions = createRouteTransitions({ plugin, maxDuration: 1000 })
    await transitions.begin('forward')
    // No finish at all: the watchdog ends it.
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls.at(-1)?.[0]).toBe('finish')
    expect(transitions.active).toBe(false)

    vi.useRealTimers()
    await transitions.begin('forward')
    await transitions.finish(() => Promise.reject(new Error('boom')))
    expect(calls.filter(([name]) => name === 'finish')).toHaveLength(2)
  })

  it('waits for the running animation before taking the next snapshot', async () => {
    const { plugin, calls, hold, release } = mockPlugin()
    hold()
    const transitions = createRouteTransitions({ plugin })
    await transitions.begin('forward')
    const finishing = transitions.finish(async () => {})
    await vi.waitFor(() => expect(calls.at(-1)?.[0]).toBe('finish'))
    const next = transitions.begin('back')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(calls.filter(([name]) => name === 'begin')).toHaveLength(1)
    let settled = false
    void transitions.settled().then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await finishing
    await next
    expect(calls.filter(([name]) => name === 'begin')).toHaveLength(2)
  })

  it('does nothing without plugin support', async () => {
    const transitions = createRouteTransitions({ plugin: {} })
    await transitions.begin('forward')
    expect(transitions.active).toBe(false)
    await expect(transitions.finish(async () => {})).resolves.toBeUndefined()
  })
})

describe('native tab taps', () => {
  it('wait for a page transition to finish before their crossfade begins', async () => {
    const { tabs } = normalizeTabs([
      { id: 'home', to: '/', label: 'Home', icon: 'i' },
      { id: 'bills', to: '/bills', label: 'Bills', icon: 'i' },
    ])
    const order: string[] = []
    const listeners: Record<string, (event: { id: string }) => void> = {}
    const plugin: NativeNavigationPluginLike = {
      configure: vi.fn(async () => {}),
      setNavbar: vi.fn(async () => {}),
      setTabbar: vi.fn(async () => {}),
      beginTransition: vi.fn(async () => {
        order.push('begin')
        return { id: 't' }
      }),
      finishTransition: vi.fn(async () => {}),
      addListener: vi.fn(async (event: string, listener: (event: { id: string }) => void) => {
        listeners[event] = listener
        return { remove: vi.fn(async () => {}) }
      }) as NativeNavigationPluginLike['addListener'],
    }
    let settle!: () => void
    const controller = createNativeNavigationController({
      plugin,
      onSelectTab: vi.fn(),
      onBack: vi.fn(),
      beforeTabTransition: () => new Promise<void>(resolve => (settle = () => {
        order.push('settled')
        resolve()
      })),
    })
    await controller.start()
    await controller.apply(resolveChrome({ platform: 'ios', nativeChrome: 'ios', nativeNavigation: true, tabs, path: '/', authenticated: true, overlays: 0, suppressed: 0, appName: 'App' }), { foreground: '#000000' })
    listeners.tabSelect!({ id: 'bills' })
    expect(controller.switchingTab).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(order).toEqual([])
    settle()
    await vi.waitFor(() => expect(order).toEqual(['settled', 'begin']))
  })
})

describe('createRouteTransitionGuards', () => {
  const route = (path: string) => ({ path, meta: {}, matched: [{}] })
  const sides: Record<string, RouteSide> = {
    '/bills': side('/bills', 'bills', true),
    '/bills/1': side('/bills/1', 'bills'),
    '/bills/2': side('/bills/2', 'bills'),
  }

  function setup(options: { skip?: boolean } = {}) {
    const { plugin, calls } = mockPlugin()
    let position = 1
    const settle = vi.fn(async () => {})
    let loaded!: () => void
    const nextPageLoaded = vi.fn(() => new Promise<void>(resolve => (loaded = resolve)))
    const guards = createRouteTransitionGuards({
      transitions: createRouteTransitions({ plugin }),
      side: r => sides[r.path]!,
      historyPosition: () => position,
      skip: () => !!options.skip,
      nextPageLoaded,
      settle,
    })
    return { guards, calls, settle, nextPageLoaded, setPosition: (value: number) => (position = value), load: () => loaded() }
  }

  it('pushes, waits for the page and the bars, then finishes', async () => {
    const { guards, calls, settle, load } = setup()
    await guards.before(route('/bills/1'), route('/bills'))
    const after = guards.after(route('/bills/1'), route('/bills'))
    await Promise.resolve()
    expect(settle).not.toHaveBeenCalled()
    load()
    await after
    expect(settle).toHaveBeenCalled()
    expect(calls.map(([name, options]) => [name, (options as { direction: string }).direction])).toEqual([['begin', 'forward'], ['finish', 'forward']])
  })

  it('pops on a history back to a sibling page', async () => {
    const { guards, calls, setPosition, load } = setup()
    setPosition(3)
    await guards.after(route('/bills/2'), route('/bills/1'))
    setPosition(2)
    await guards.before(route('/bills/1'), route('/bills/2'))
    const after = guards.after(route('/bills/1'), route('/bills/2'))
    load()
    await after
    expect(calls[0]).toEqual(['begin', { direction: 'back', duration: 300 }])
  })

  it('skips the first navigation, a skipped one and an unchanged path, and ends a failed one at once', async () => {
    const { guards, calls, nextPageLoaded } = setup()
    await guards.before(route('/bills/1'), { path: '/', meta: {}, matched: [] })
    await guards.before(route('/bills'), route('/bills'))
    expect(calls).toEqual([])
    expect(nextPageLoaded).not.toHaveBeenCalled()

    await guards.before(route('/bills/1'), route('/bills'))
    await guards.after(route('/bills/1'), route('/bills'), new Error('aborted'))
    expect(calls.map(([name]) => name)).toEqual(['begin', 'finish'])

    const skipped = setup({ skip: true })
    await skipped.guards.before(route('/bills/1'), route('/bills'))
    expect(skipped.calls).toEqual([])
  })
})
