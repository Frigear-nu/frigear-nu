import type { MobileTab } from '../../types'
import type { ChromeState } from './chrome'
import type { ListenerHandle, NativeNavigationPluginLike, NativeNavigationTabLike } from './native'

export interface NativeNavigationControllerOptions {
  plugin: NativeNavigationPluginLike
  /** A native tab was tapped. */
  onSelectTab: (tab: MobileTab) => void | Promise<void>
  /** The native back button was tapped. */
  onBack: () => void | Promise<void>
  /** Translates a tab label. */
  label?: (tab: MobileTab) => string
}

export interface NativeNavigationController {
  /** Configures the plugin (`contentInsetMode: 'css'`: bar sizes as `--cap-native-*` CSS variables) and listens. */
  start: () => Promise<void>
  /** Brings the native bars in line with `state`. Calls the plugin only for what changed. */
  apply: (state: ChromeState, colors: { foreground: string }) => Promise<void>
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

/**
 * Drives `@capgo/capacitor-native-navigation` from the chrome state. Routing stays in Nuxt: a native tap only calls
 * `onSelectTab`, and the bars follow the route. Calls are serialized (the plugin animates) and skipped when the bar
 * would not change.
 */
export function createNativeNavigationController(options: NativeNavigationControllerOptions): NativeNavigationController {
  const { plugin } = options
  const label = options.label ?? ((tab: MobileTab) => tab.label)
  const listeners: ListenerHandle[] = []
  let tabs: MobileTab[] = []
  let lastTabbar: string | undefined
  let lastNavbar: string | undefined
  let queue: Promise<void> = Promise.resolve()

  const run = (task: () => Promise<void>) => {
    queue = queue.then(task, task)
    return queue
  }

  return {
    async start() {
      await plugin.configure({ contentInsetMode: 'css' })
      listeners.push(await plugin.addListener('tabSelect', ({ id }) => {
        const tab = tabs.find(candidate => candidate.id === id)
        if (tab) void options.onSelectTab(tab)
      }))
      listeners.push(await plugin.addListener('navbarBack', () => void options.onBack()))
    },

    apply(state, colors) {
      return run(async () => {
        tabs = state.tabs
        const tabbar = state.tabBar.visible
          ? { hidden: false, selectedId: state.activeTab?.id, tabs: state.tabs.map(tab => toNativeTab(tab, label(tab))) }
          : { hidden: true }
        const navbar = state.header.visible
          ? {
              hidden: false,
              title: state.header.title,
              large: state.header.largeTitle,
              backButton: { visible: state.header.back },
              colors: { foreground: colors.foreground },
            }
          : { hidden: true }

        // Hide the tab bar first and show it last, so it never covers an opening sheet.
        const tabbarKey = JSON.stringify(tabbar)
        const navbarKey = JSON.stringify(navbar)
        if (tabbar.hidden && tabbarKey !== lastTabbar) {
          await plugin.setTabbar(tabbar)
          lastTabbar = tabbarKey
        }
        if (navbarKey !== lastNavbar) {
          await plugin.setNavbar(navbar)
          lastNavbar = navbarKey
        }
        if (!tabbar.hidden && tabbarKey !== lastTabbar) {
          await plugin.setTabbar(tabbar)
          lastTabbar = tabbarKey
        }
      })
    },

    async stop() {
      await Promise.all(listeners.splice(0).map(listener => listener.remove()))
    },
  }
}
