// The parts of the Capacitor plugins the module uses. Structural types, so the module type-checks and builds without
// the (optional) plugins installed; `#mobile/native` only imports the installed ones.

export interface ListenerHandle {
  remove: () => Promise<void>
}

export interface AppPluginLike {
  addListener(event: 'appUrlOpen', listener: (event: { url: string }) => void): Promise<ListenerHandle>
  addListener(event: 'backButton', listener: (event: { canGoBack: boolean }) => void): Promise<ListenerHandle>
  getLaunchUrl(): Promise<{ url: string } | undefined>
  minimizeApp(): Promise<void>
}

export interface HapticsPluginLike {
  impact(options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void>
  notification(options: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }): Promise<void>
  selectionChanged(): Promise<void>
}

export interface ActionSheetPluginLike {
  showActions(options: {
    title?: string
    message?: string
    options: { title: string, style?: 'DEFAULT' | 'DESTRUCTIVE' | 'CANCEL' }[]
  }): Promise<{ index: number, canceled?: boolean }>
}

export interface DialogPluginLike {
  confirm(options: { title?: string, message: string, okButtonTitle?: string, cancelButtonTitle?: string }): Promise<{ value: boolean }>
}

export interface SharePluginLike {
  share(options: { title?: string, text?: string, url?: string, dialogTitle?: string }): Promise<unknown>
}

export interface StatusBarPluginLike {
  setStyle(options: { style: 'DARK' | 'LIGHT' | 'DEFAULT' }): Promise<void>
}

export interface KeyboardPluginLike {
  setAccessoryBarVisible(options: { isVisible: boolean }): Promise<void>
}

export interface SplashScreenPluginLike {
  hide(options?: { fadeOutDuration?: number }): Promise<void>
}

export interface NativeNavigationIconLike {
  ios?: { sfSymbol?: string }
  android?: { resource?: string }
}

export interface NativeNavigationTabLike {
  id: string
  title?: string
  icon?: NativeNavigationIconLike
  selectedIcon?: NativeNavigationIconLike
}

export interface NativeNavigationColorsLike {
  foreground?: string
  tint?: string
}

export interface NativeNavigationBarButtonLike {
  /** Reported back in `navbarItemTap`. */
  id: string
  /** Drawn as text (leave it out for an icon-only button). */
  title?: string
  accessibilityLabel?: string
  icon?: NativeNavigationIconLike
  enabled?: boolean
}

export interface NativeNavigationNavbarLike {
  hidden?: boolean
  title?: string
  large?: boolean
  colors?: NativeNavigationColorsLike
  /** `supplements`: keep `leftItems` beside the back button. */
  backButton?: { visible?: boolean, supplements?: boolean }
  leftItems?: NativeNavigationBarButtonLike[]
  rightItems?: NativeNavigationBarButtonLike[]
}

export interface NativeNavigationTabbarLike {
  hidden?: boolean
  tabs?: NativeNavigationTabLike[]
  selectedId?: string
  colors?: NativeNavigationColorsLike
  /** With `hidden: true`: a soft hide that keeps the bar mounted (pass the tabs last shown). */
  animated?: boolean
}

export type NativeNavigationTransitionDirection = 'forward' | 'back' | 'root' | 'tab' | 'none'

export interface NativeNavigationPluginLike {
  configure(options: { contentInsetMode?: 'css' | 'none' }): Promise<unknown>
  setNavbar(options: NativeNavigationNavbarLike): Promise<unknown>
  setTabbar(options: NativeNavigationTabbarLike): Promise<unknown>
  /** Covers the WebView with a snapshot of it until `finishTransition` (missing in older plugin versions). */
  beginTransition?(options: { direction?: NativeNavigationTransitionDirection, duration?: number }): Promise<{ id: string }>
  /** Animates the snapshot away: a crossfade for `tab`. */
  finishTransition?(options: { id?: string, direction?: NativeNavigationTransitionDirection, duration?: number }): Promise<unknown>
  addListener(event: 'tabSelect', listener: (event: { id: string }) => void): Promise<ListenerHandle>
  addListener(event: 'navbarBack', listener: (event: unknown) => void): Promise<ListenerHandle>
  addListener(event: 'navbarItemTap', listener: (event: { id: string, placement?: 'left' | 'right' }) => void): Promise<ListenerHandle>
}

export type NativePluginName
  = | 'app' | 'haptics' | 'actionSheet' | 'dialog' | 'share' | 'statusBar' | 'keyboard' | 'nativeNavigation' | 'splashScreen'

export interface NativePlugins {
  app: AppPluginLike
  haptics: HapticsPluginLike
  actionSheet: ActionSheetPluginLike
  dialog: DialogPluginLike
  share: SharePluginLike
  statusBar: StatusBarPluginLike
  keyboard: KeyboardPluginLike
  nativeNavigation: NativeNavigationPluginLike
  splashScreen: SplashScreenPluginLike
}

/** Package and export of each native plugin. */
export const NATIVE_PLUGINS: Record<NativePluginName, { pkg: string, name: string, feature: string, required?: boolean }> = {
  app: { pkg: '@capacitor/app', name: 'App', feature: 'deep links and the Android back button', required: true },
  haptics: { pkg: '@capacitor/haptics', name: 'Haptics', feature: 'useNative().haptic and switch haptics' },
  actionSheet: { pkg: '@capacitor/action-sheet', name: 'ActionSheet', feature: 'useNative().actionSheet and destructive confirms' },
  dialog: { pkg: '@capacitor/dialog', name: 'Dialog', feature: 'useNative().confirm' },
  share: { pkg: '@capacitor/share', name: 'Share', feature: 'useNative().share' },
  statusBar: { pkg: '@capacitor/status-bar', name: 'StatusBar', feature: 'status bar colour mode (native.statusBar)' },
  keyboard: { pkg: '@capacitor/keyboard', name: 'Keyboard', feature: 'the keyboard accessory bar (native.keyboardAccessoryBar)' },
  nativeNavigation: { pkg: '@capgo/capacitor-native-navigation', name: 'NativeNavigation', feature: 'the native navbar and tab bar (nativeChrome)' },
  splashScreen: { pkg: '@capacitor/splash-screen', name: 'SplashScreen', feature: 'the native launch screen, handed over to the splash screen (splashScreen.native)' },
}

/** Capacitor's platform, synchronously (the native bridge defines `window.Capacitor` before the app runs). */
export function getPlatform(): 'ios' | 'android' | 'web' {
  const capacitor = (globalThis as { Capacitor?: { getPlatform?: () => string, isNativePlatform?: () => boolean } }).Capacitor
  if (!capacitor?.isNativePlatform?.()) return 'web'
  const platform = capacitor.getPlatform?.()
  return platform === 'ios' || platform === 'android' ? platform : 'web'
}

/**
 * The plugin as a promise can resolve to. A Capacitor plugin is a proxy with a method for every property, `then`
 * included, so a promise resolved with it calls the native `then()`, which rejects as not implemented, and never
 * settles: the app would wait for it forever. The generated loaders wrap every plugin in this.
 */
export function withoutThen<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get: (target, key, receiver) => (key === 'then' ? undefined : Reflect.get(target, key, receiver)),
  })
}
