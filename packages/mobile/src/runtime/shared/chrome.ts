import type { MobilePageMeta, MobileTab, NativeChromeOption } from '../../types'
import { findActiveTab, isTabRoot } from './tabs'

/** Overlays Nuxt UI renders open: modals, slideovers, drawers (dropdown menus and popovers are not dialogs). */
export const OPEN_OVERLAY_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

export type MobilePlatform = 'ios' | 'android' | 'web'

export interface ChromeInput {
  platform: MobilePlatform
  nativeChrome: NativeChromeOption
  /** Whether `@capgo/capacitor-native-navigation` is installed. */
  nativeNavigation: boolean
  tabs: MobileTab[]
  path: string
  page?: MobilePageMeta
  /** `null` when the app has no sign-in. */
  authenticated: boolean | null
  /** Open dialogs, slideovers, drawers. */
  overlays: number
  /** Open `suppress()` calls. */
  suppressed: number
  appName: string
  /** Translates an i18n key, returning `fallback` when there is none. */
  translate?: (key: string | undefined, fallback: string) => string
}

export interface ChromeState {
  /** `native`: the plugin draws the navbar and tab bar; `web`: `MobileHeader` / `MobileTabBar` do. */
  mode: 'native' | 'web'
  /** The tabs shown (signed out, `requiresAuth` tabs are left out). */
  tabs: MobileTab[]
  activeTab: MobileTab | null
  tabBar: { visible: boolean }
  header: { visible: boolean, title: string, largeTitle: boolean, back: boolean }
}

/** Whether the native bars draw the chrome on this platform. */
export function usesNativeChrome(platform: MobilePlatform, option: NativeChromeOption, pluginInstalled: boolean): boolean {
  if (!pluginInstalled || option === false || platform === 'web') return false
  return option === 'all' || platform === 'ios'
}

/**
 * Everything the shell shows for a route: which chrome (native or web), the tabs, the selected one, whether the tab
 * bar shows (not while an overlay is open: on iOS 26 it floats over the WebView and would cover a sheet's actions) and
 * the title (page meta, else the selected tab, else the app name).
 */
export function resolveChrome(input: ChromeInput): ChromeState {
  const translate = input.translate ?? ((_key: string | undefined, fallback: string) => fallback)
  const page = input.page ?? {}
  const tabs = input.tabs.filter(tab => !tab.requiresAuth || input.authenticated !== false)
  const activeTab = findActiveTab(tabs, input.path, page.tab) ?? null
  const root = isTabRoot(activeTab ?? undefined, input.path)

  const tabTitle = activeTab ? translate(activeTab.titleKey, activeTab.title ?? translate(activeTab.labelKey, activeTab.label)) : undefined
  const title = page.title || page.titleKey ? translate(page.titleKey, page.title ?? input.appName) : (tabTitle ?? input.appName)

  const wantsTabBar = page.tabBar ?? !!activeTab
  return {
    mode: usesNativeChrome(input.platform, input.nativeChrome, input.nativeNavigation) ? 'native' : 'web',
    tabs,
    activeTab,
    tabBar: { visible: wantsTabBar && tabs.length > 0 && input.overlays === 0 && input.suppressed === 0 },
    header: {
      visible: page.navbar !== false,
      title,
      largeTitle: page.largeTitle ?? (root && (activeTab?.largeTitle ?? true)),
      back: page.back ?? (activeTab ? !root : tabs.length > 0),
    },
  }
}
