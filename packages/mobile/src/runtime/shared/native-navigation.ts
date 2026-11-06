import type { MobileTab } from '../../types'
import type { ChromeAction, ChromeState } from './chrome'
import type {
  ListenerHandle,
  NativeNavigationBarButtonLike,
  NativeNavigationNavbarLike,
  NativeNavigationPluginLike,
  NativeNavigationTabbarLike,
  NativeNavigationTabLike,
} from './native'

export interface NativeNavigationControllerOptions {
  plugin: NativeNavigationPluginLike
  /** A native tab was tapped. */
  onSelectTab: (tab: MobileTab) => void | Promise<void>
  /** The native back button was tapped. */
  onBack: () => void | Promise<void>
  /** A native navbar action was tapped (only enabled actions of the current page). */
  onAction?: (action: ChromeAction) => unknown
  /** Translates a tab label. */
  label?: (tab: MobileTab) => string
  /** Length of the crossfade between two tabs, in ms. `0` switches without one. Default 180. */
  tabTransitionDuration?: number
}

export interface NativeNavigationController {
  /** Configures the plugin (`contentInsetMode: 'css'`: bar sizes as `--cap-native-*` CSS variables) and listens. */
  start: () => Promise<void>
  /** Brings the native bars in line with `state`. Calls the plugin only for what changed. */
  apply: (state: ChromeState, colors: { foreground: string }) => Promise<void>
  /** Resolves once every queued bar update has run. */
  idle: () => Promise<void>
  stop: () => Promise<void>
}

const icon = (sfSymbol?: string, androidIcon?: string) => (sfSymbol || androidIcon
  ? { ...(sfSymbol ? { ios: { sfSymbol } } : {}), ...(androidIcon ? { android: { resource: androidIcon } } : {}) }
  : undefined)

/** The native tab of a tab. */
export function toNativeTab(tab: MobileTab, title: string): NativeNavigationTabLike {
  const native: NativeNavigationTabLike = { id: tab.id, title }
  const normal = icon(tab.sfSymbol, tab.androidIcon)
  if (normal) native.icon = normal
  if (tab.sfSymbolActive) native.selectedIcon = icon(tab.sfSymbolActive, tab.androidIcon)
  return native
}

/** The native navbar button of an action: an icon when it has one for the platform, else its label as text. */
export function toNativeBarButton(action: ChromeAction): NativeNavigationBarButtonLike {
  const native: NativeNavigationBarButtonLike = { id: action.id, accessibilityLabel: action.label }
  const symbol = icon(action.sfSymbol, action.androidIcon)
  if (symbol) native.icon = symbol
  else native.title = action.label
  if (action.disabled) native.enabled = false
  return native
}

/**
 * The visible navbar of a chrome state. The items are always sent, empty included, so a page without actions clears
 * the last page's (the iOS plugin resets them on every `setNavbar` anyway) and the dedupe key follows the actions.
 */
export function toNativeNavbar(state: ChromeState, colors: { foreground: string }): NativeNavigationNavbarLike {
  const actions = state.header.actions ?? []
  const leftItems = actions.filter(action => action.placement === 'left').map(toNativeBarButton)
  const rightItems = actions.filter(action => action.placement !== 'left').map(toNativeBarButton)
  return {
    hidden: false,
    title: state.header.title,
    large: state.header.largeTitle,
    // Without `supplements` the back button hides the left items on Android.
    backButton: state.header.back && leftItems.length ? { visible: true, supplements: true } : { visible: state.header.back },
    colors: { foreground: colors.foreground },
    leftItems,
    rightItems,
  }
}

/**
 * Drives `@capgo/capacitor-native-navigation` from the chrome state. Routing stays in Nuxt: a native tap only calls
 * `onSelectTab`, and the bars follow the route. Calls are serialized (the plugin animates) and skipped when the bar
 * would not change.
 *
 * A tap on another tab runs under a snapshot of the WebView (`beginTransition`): `onSelectTab` resolves once the new
 * page is ready, the bars are updated, then the snapshot crossfades away. The page and the bars change in one step.
 */
export function createNativeNavigationController(options: NativeNavigationControllerOptions): NativeNavigationController {
  const { plugin } = options
  const label = options.label ?? ((tab: MobileTab) => tab.label)
  const listeners: ListenerHandle[] = []
  let tabs: MobileTab[] = []
  let lastTabbar: string | undefined
  let lastNavbar: string | undefined
  /** The tabs and selection last shown, for a soft hide. */
  let shown: { tabs: NativeNavigationTabLike[], selectedId?: string } | undefined
  let softHidden = false
  let latest: { state: ChromeState, colors: { foreground: string } } | undefined
  /** The tab last tapped in the native bar, which already shows it selected. */
  let nativeSelected: string | undefined
  /** The visible tab bar last sent, without its selection. */
  let lastTabsKey: string | undefined
  let queue: Promise<void> = Promise.resolve()
  const duration = options.tabTransitionDuration ?? 180

  const run = (task: () => Promise<void>) => {
    queue = queue.then(task, task)
    return queue
  }

  const update = (state: ChromeState, colors: { foreground: string }, force = false) => run(async () => {
    tabs = state.tabs
    if (force) lastTabbar = undefined
    const visible = state.tabBar.visible
      ? { hidden: false, selectedId: state.activeTab?.id, tabs: state.tabs.map(tab => toNativeTab(tab, label(tab))) }
      : undefined
    // Hidden after being shown (an overlay, `suppress()`): a soft hide with the same tabs, as the plugin asks. A bare
    // `hidden: true` tears the iOS tab controller down.
    const tabbar: NativeNavigationTabbarLike = visible
      ?? (shown ? { hidden: true, animated: true, tabs: shown.tabs, selectedId: shown.selectedId } : { hidden: true })
    const navbar: NativeNavigationNavbarLike = state.header.visible ? toNativeNavbar(state, colors) : { hidden: true }

    // Hide the tab bar first and show it last, so it never covers an opening sheet.
    const tabbarKey = JSON.stringify(visible ?? { hidden: true })
    const navbarKey = JSON.stringify(navbar)
    if (!visible && tabbarKey !== lastTabbar) {
      await plugin.setTabbar(tabbar)
      lastTabbar = tabbarKey
      softHidden = !!shown
    }
    if (navbarKey !== lastNavbar) {
      await plugin.setNavbar(navbar)
      lastNavbar = navbarKey
    }
    if (visible && tabbarKey !== lastTabbar) {
      const tabsKey = JSON.stringify({ ...visible, selectedId: undefined })
      // Only the selection moved, to the tab the user just tapped: UIKit already shows it, and sending every item
      // again redraws the bar.
      const alreadyShown = !softHidden && tabsKey === lastTabsKey && visible.selectedId === nativeSelected
      if (!alreadyShown) await plugin.setTabbar(softHidden ? { ...visible, animated: true } : visible)
      lastTabbar = tabbarKey
      lastTabsKey = tabsKey
      shown = { tabs: visible.tabs, selectedId: visible.selectedId }
      softHidden = false
    }
    if (!visible) lastTabsKey = undefined
  })

  /** Navigates to `tab`, under a crossfade when the plugin has transitions and the tab changes. */
  const selectTab = async (tab: MobileTab) => {
    const switching = duration > 0 && latest?.state.activeTab?.id !== tab.id && typeof plugin.beginTransition === 'function'
    let transition: { id: string } | undefined
    if (switching) {
      try {
        transition = await plugin.beginTransition!({ direction: 'tab', duration })
      }
      catch {
        transition = undefined
      }
    }
    try {
      await options.onSelectTab(tab)
    }
    finally {
      // The native bar selected the tapped tab on its own. When the navigation did not land on it (a guard, a
      // redirect), the chrome state may not have changed: send the tab bar again so it shows the route's tab.
      if (latest && latest.state.activeTab?.id !== tab.id) void update(latest.state, latest.colors, true).catch(() => {})
      await queue.catch(() => {})
      nativeSelected = undefined
      // Never leave the snapshot up, whatever happened to the navigation.
      if (transition) await plugin.finishTransition?.({ id: transition.id, direction: 'tab', duration }).catch(() => {})
    }
  }

  // One tab switch at a time: a transition begun while another is fading out leaves its snapshot over the WebView
  // (the plugin's cleanup forgets the newer snapshot). Taps during a switch wait for it, and only the last one runs.
  let switching = false
  let requested: MobileTab | undefined
  const requestTab = async (tab: MobileTab) => {
    requested = tab
    if (switching) return
    switching = true
    try {
      while (requested) {
        const next: MobileTab = requested
        requested = undefined
        nativeSelected = next.id
        await selectTab(next).catch(() => {})
      }
    }
    finally {
      switching = false
    }
  }

  return {
    async start() {
      await plugin.configure({ contentInsetMode: 'css' })
      listeners.push(await plugin.addListener('tabSelect', ({ id }) => {
        const tab = tabs.find(candidate => candidate.id === id)
        if (tab) void requestTab(tab)
      }))
      listeners.push(await plugin.addListener('navbarBack', () => void options.onBack()))
      listeners.push(await plugin.addListener('navbarItemTap', ({ id }) => {
        // The bar shows the actions last sent, which are the latest state's once the queue has run.
        const action = latest?.state.header.visible ? latest.state.header.actions?.find(candidate => candidate.id === id) : undefined
        if (!action || action.disabled || !options.onAction) return
        void Promise.resolve()
          .then(() => options.onAction!(action))
          .catch(error => console.error('[@frigear-nu/mobile] Navbar action failed:', error))
      }))
    },

    apply(state, colors) {
      latest = { state, colors }
      return update(state, colors)
    },

    idle: () => queue.catch(() => {}),

    async stop() {
      await Promise.all(listeners.splice(0).map(listener => listener.remove()))
    },
  }
}
