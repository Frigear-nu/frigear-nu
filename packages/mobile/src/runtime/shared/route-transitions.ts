import type { NativeNavigationPluginLike, NativeNavigationTransitionDirection } from './native'

export interface RouteSide {
  path: string
  /** The id of the tab selected on this route, if any. */
  tab?: string
  /** Whether the route is its tab's root page. */
  tabRoot: boolean
}

/**
 * How a navigation animates, like a native navigation stack:
 *
 * - `back`: a history back (the navbar back button, Android back), or up to the tab's root or a parent path;
 * - `tab`: a crossfade, to another tab or from or to a page outside the tabs;
 * - `forward`: a push, to any other page of the same tab;
 * - `undefined`: no transition (the same path, e.g. only the query changed).
 */
export function routeTransitionDirection(from: RouteSide, to: RouteSide, historyBack = false): Exclude<NativeNavigationTransitionDirection, 'root' | 'none'> | undefined {
  if (from.path === to.path) return undefined
  if (historyBack) return 'back'
  if (!from.tab || !to.tab || from.tab !== to.tab) return 'tab'
  if (to.tabRoot) return 'back'
  if (isAncestor(to.path, from.path)) return 'back'
  return 'forward'
}

function isAncestor(parent: string, child: string): boolean {
  const base = parent.replace(/\/+$/, '')
  return base === '' ? child !== '/' : child.startsWith(`${base}/`)
}

export interface RouteTransitionsOptions {
  plugin: Pick<NativeNavigationPluginLike, 'beginTransition' | 'finishTransition'>
  /** Length of the push / pop, in ms. Default 300 (the iOS navigation controller's). */
  duration?: number
  /** Length of the crossfade of `tab`, in ms. Default 180. */
  fadeDuration?: number
  /** Longest wait for the snapshot before the navigation goes on without one, in ms. Default 250. */
  beginTimeout?: number
  /** Longest a snapshot stays up, whatever happens to the navigation, in ms. Default 3000. */
  maxDuration?: number
}

export interface RouteTransitions {
  /**
   * Covers the WebView with a snapshot of the current page (before the route changes). Resolves once it is up, or
   * after `beginTimeout`. A navigation that starts while a snapshot is up keeps that snapshot.
   */
  begin: (direction: NativeNavigationTransitionDirection) => Promise<void>
  /** Animates the snapshot away once `ready` resolves (the new page has painted). Only the latest navigation's finish runs. */
  finish: (ready: () => Promise<unknown>) => Promise<void>
  /** Whether a snapshot is up or being taken. */
  readonly active: boolean
  /**
   * Resolves once the last snapshot has animated away. Begin another transition (a native tab tap) only then: the
   * plugin's cleanup of a running animation forgets a snapshot taken meanwhile, which then stays over the WebView.
   */
  settled: () => Promise<void>
}

/**
 * Native transitions for in-app navigations (`@capgo/capacitor-native-navigation` transition transactions): a snapshot of
 * the old page covers the WebView while the new page renders, its data loads and the native bars change, then it slides
 * (push / pop) or fades (tab) away. Without it the bars change before the page, and the page jumps as the navbar height
 * changes. Without plugin support it does nothing.
 */
export function createRouteTransitions(options: RouteTransitionsOptions): RouteTransitions {
  const { plugin } = options
  const supported = typeof plugin.beginTransition === 'function' && typeof plugin.finishTransition === 'function'
  interface Current { started: Promise<{ id: string } | undefined>, direction: NativeNavigationTransitionDirection, watchdog?: ReturnType<typeof setTimeout> }
  let current: Current | undefined
  let generation = 0
  const durationOf = (direction: NativeNavigationTransitionDirection) => direction === 'tab' ? (options.fadeDuration ?? 180) : (options.duration ?? 300)
  /** The finish animation running, with a cap so a plugin that never answers cannot block navigation. */
  let finishing: Promise<void> = Promise.resolve()
  const capped = (promise: Promise<unknown>, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    return Promise.race([promise, new Promise<void>(resolve => (timer = setTimeout(resolve, ms)))]).then(() => clearTimeout(timer))
  }

  /** Animates the snapshot of `transition` away, once. */
  const end = async (transition: Current) => {
    if (current !== transition) return
    current = undefined
    clearTimeout(transition.watchdog)
    const duration = durationOf(transition.direction)
    const run = transition.started.then(started => started
      ? plugin.finishTransition!({ id: started.id, direction: transition.direction, duration }).then(() => {}, () => {})
      : undefined)
    finishing = capped(run, duration + 500)
    await finishing
  }

  return {
    async begin(direction) {
      generation++
      if (!supported) return
      if (current) {
        // A redirect or a second tap: the snapshot already shows the page the user left. The last navigation decides
        // how it goes away.
        current.direction = direction
        return
      }
      // The last snapshot has to be gone first (see `settled`).
      const previous = capped(finishing, 1000)
      const started = previous
        .then(() => plugin.beginTransition!({ direction, duration: durationOf(direction) }))
        .catch(() => undefined)
      const transition: Current = { started, direction }
      current = transition
      // A navigation that never finishes (an error before `afterEach`) must not leave the old page over the app.
      transition.watchdog = setTimeout(() => void end(transition), options.maxDuration ?? 3000)
      await previous
      await capped(started, options.beginTimeout ?? 250)
    },

    async finish(ready) {
      const mine = generation
      if (!current) return
      try {
        await ready()
      }
      catch {
        // Never leave the snapshot up.
      }
      // A newer navigation started meanwhile: its finish removes the snapshot.
      if (mine !== generation || !current) return
      await end(current)
    },

    get active() {
      return current !== undefined
    },

    settled: () => finishing,
  }
}

interface RouteLike {
  path: string
  meta: { mobile?: unknown }
  matched: unknown[]
}

export interface RouteTransitionGuardsOptions {
  transitions: RouteTransitions
  /** The tab facts of a route. */
  side: (route: RouteLike) => RouteSide
  /** Vue Router's `history.state.position`: a navigation to a lower one is a history back. */
  historyPosition: () => unknown
  /** No transition now (the splash screen is up, a native tab tap runs its own). */
  skip?: () => boolean
  /** Whether `tab` navigations crossfade. Default `true`. */
  fade?: boolean
  /** Resolves when the next page has loaded (`nextPageLoaded`); called before the navigation. */
  nextPageLoaded: () => Promise<void>
  /** Resolves once the bars are updated and the page has painted. */
  settle: () => Promise<void>
}

/** `router.beforeEach` / `router.afterEach` guards that run in-app navigations under `transitions`. */
export function createRouteTransitionGuards(options: RouteTransitionGuardsOptions) {
  const { transitions } = options
  let lastPosition = options.historyPosition()
  let pageLoaded: Promise<void> | undefined
  return {
    async before(to: RouteLike, from: RouteLike): Promise<void> {
      // Not on the first navigation: nothing is on screen yet.
      if (!from.matched.length || options.skip?.()) return
      const position = options.historyPosition()
      const historyBack = typeof position === 'number' && typeof lastPosition === 'number' && position < lastPosition
      const direction = routeTransitionDirection(options.side(from), options.side(to), historyBack)
      if (!direction || (direction === 'tab' && options.fade === false)) return
      pageLoaded = options.nextPageLoaded()
      await transitions.begin(direction)
    },
    after(to: RouteLike, from: RouteLike, failure?: unknown): Promise<void> {
      lastPosition = options.historyPosition()
      if (!transitions.active) return Promise.resolve()
      const loaded = pageLoaded
      return transitions.finish(async () => {
        if (!failure && to.path !== from.path) await loaded
        await options.settle()
      })
    },
  }
}
