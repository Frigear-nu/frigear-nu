/**
 * A tab of the app's tab bar. The same entry feeds the native tab bar (iOS, `@capgo/capacitor-native-navigation`), the
 * web tab bar (`MobileTabBar`) and the page titles (`MobileHeader` / native navbar).
 */
export interface MobileTabDefinition {
  /** Stable id: the native tab id, the `:key` and what `extendMobileTabs` replaces by. */
  id: string
  /** The tab's root page, e.g. `/bills`. */
  to: string
  /** Label under the icon. */
  label: string
  /** i18n key of the label (used when `@nuxtjs/i18n` has it). */
  labelKey?: string
  /** Navbar title on this tab. Default: the label. */
  title?: string
  titleKey?: string
  /** Nuxt UI icon of the web tab bar, e.g. `i-lucide-receipt-text`. */
  icon: string
  /** Icon of the selected tab in the web tab bar. Default: `icon`. */
  activeIcon?: string
  /** SF Symbol of the native iOS tab, e.g. `list.bullet.rectangle`. */
  sfSymbol?: string
  /** SF Symbol of the selected native tab, e.g. `list.bullet.rectangle.fill`. */
  sfSymbolActive?: string
  /** Android drawable resource name of the native tab (with `nativeChrome: 'all'`). */
  androidIcon?: string
  /** Hidden while signed out. Default: `mobile.auth` (on when `@frigear-nu/oauth-client` signs the app in). */
  requiresAuth?: boolean
  /**
   * Paths on which this tab is the selected one. Default: `to` and everything below it (`/bills/**`); `/` only matches
   * itself. A pattern ending in `/**` matches the path and everything below it.
   */
  match?: string | string[]
  /** iOS large title on the tab's root page. Default `true`. */
  largeTitle?: boolean
  /** Lower first; tabs without `order` follow in registration order. */
  order?: number
}

/** A tab after normalization: `match` resolved, `requiresAuth` decided. */
export interface MobileTab extends Omit<MobileTabDefinition, 'match' | 'requiresAuth'> {
  match: string[]
  requiresAuth: boolean
}

/** `definePageMeta({ mobile: { ... } })`. */
export interface MobilePageMeta {
  /** Navbar / header title of this page. Default: the selected tab's title, else `appName`. */
  title?: string
  titleKey?: string
  /** iOS large title. Default: on a tab's root page. */
  largeTitle?: boolean
  /** `false` hides the tab bar on this page, `true` shows it even when no tab matches. */
  tabBar?: boolean
  /** `false` hides the navbar / header on this page. */
  navbar?: boolean
  /** The id of the tab to select on this page, when its path does not match one. */
  tab?: string
  /** A back button in the navbar / header. Default: on pages that are not a tab's root page. */
  back?: boolean
}

export type NativeChromeOption = 'ios' | 'all' | false

export interface ModuleOptions {
  /**
   * Reverse-DNS app id, e.g. `nu.frigear.app`. Becomes `capacitor.config.appId` and, lowercased, the URL scheme of the
   * OAuth redirect. Default: `capacitor.config.appId`.
   */
  appId?: string
  /** Display name: `capacitor.config.appName` and the fallback page title. */
  appName?: string
  /** The tabs. Modules add theirs with `extendMobileTabs()` from `@frigear-nu/mobile/utils`. */
  tabs?: MobileTabDefinition[]
  /**
   * Whether the shell follows the sign-in state of `@frigear-nu/oauth-client` (tabs with `requiresAuth` only show
   * signed in). Default: on when `oauthClient` is configured.
   */
  auth?: boolean
  /** `true` (default): a static SPA (`ssr: false`), which is what Capacitor serves from the device. */
  spa?: boolean
  /** Name of the layout pages get: the module's `mobile` layout unless the app has one of that name. Default `mobile`; `false` for none. */
  layout?: string | false
  /**
   * Native navbar and tab bar (`@capgo/capacitor-native-navigation`) instead of the web ones: `ios` (default) on iOS,
   * `all` on iOS and Android, `false` never. Without the plugin installed the web chrome is used.
   */
  nativeChrome?: NativeChromeOption
  native?: {
    /** Status bar text follows the app's colour mode. Default `true`. */
    statusBar?: boolean
    /** iOS: the bar with Done above the keyboard (number pads have none otherwise). Default `true`. */
    keyboardAccessoryBar?: boolean
    /** A selection tick when a switch (`role="switch"`) is tapped. Default `true`. */
    switchHaptics?: boolean
    /** Android back button: close an overlay, go back, then minimize the app. Default `true`. */
    backButton?: boolean
  }
  appearance?: {
    /** The iOS type scale (17pt body) instead of the web one a step smaller. Default `true`. */
    iosTypeScale?: boolean
    /** No grey flash over tapped elements, and `:active` states on iOS. Default `true`. */
    tapHighlight?: boolean
    /** Toasts at the top, below the navbar, as iOS banners. Default `true`. */
    toasterOffset?: boolean
  }
  /** Deep links routed into the app (OAuth callbacks are always left to `@frigear-nu/oauth-client`). */
  deepLinks?: {
    /** `https` hosts of universal links / app links, e.g. `['app.example.com']`. Default none. */
    hosts?: string[]
    /** Custom schemes. Default: the app id, lowercased. `false` turns deep links off. */
    schemes?: string[] | false
  }
  dev?: {
    /**
     * A build to run on a phone against a server on this machine (no live reload): `localhost` in the OAuth issuer
     * and API base is rewritten to this machine's LAN address. Only applies when `MOBILE_LAN` is set
     * (`MOBILE_LAN=1`, or `MOBILE_LAN=192.168.1.20`), never in `nuxt dev` (live reload rewrites on its own) or with
     * `MOBILE_RELEASE=1`. `true` (default) detects the address, a string fixes it.
     */
    lanHost?: boolean | string
  }
  ios?: {
    /** `NSAllowsLocalNetworking` in Info.plist (plain http to the LAN, for development servers). Default `true`. */
    allowLocalNetworking?: boolean
  }
  /** Warnings on dev / build start about the native projects and missing plugins. Default `true`. */
  doctor?: boolean
}

/** `runtimeConfig.public.mobile`. */
export interface MobilePublicConfig {
  appId: string
  appName: string
  auth: boolean
  nativeChrome: NativeChromeOption
  layout: string | false
  toasterOffset: boolean
  native: { statusBar: boolean, keyboardAccessoryBar: boolean, switchHaptics: boolean, backButton: boolean }
  deepLinks: { hosts: string[], schemes: string[] }
  /** Set on `MOBILE_LAN` builds only. */
  lanHost: string
}

/** What the module writes to `.nuxt/mobile/native.json` for the `frigear-mobile` CLI. */
export interface MobileNativeManifest {
  appId: string
  appName: string
  /** The OAuth redirect URI on a device, when the app signs in. */
  redirectUri: string
  /** URL schemes the iOS and Android projects must register (the redirect URI's and `deepLinks.schemes`). */
  schemes: string[]
  /** `https` hosts of app links. */
  hosts: string[]
  allowLocalNetworking: boolean
  /** Capacitor plugins the enabled features use, required ones first. */
  plugins: { name: string, required: boolean, feature: string }[]
}

export interface MobileDeepLinkContext {
  url: string
  /** The app path the link resolved to. Change it to route elsewhere. */
  path: string
  /** Call to handle the link yourself (no navigation). */
  preventDefault: () => void
}

export interface MobileBackButtonContext {
  canGoBack: boolean
  /** Call when the hook handled the press. */
  preventDefault: () => void
}
