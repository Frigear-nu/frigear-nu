import { useRuntimeConfig } from '#imports'
import { plugins } from '#desktop/native'
import { detectOs, isTauri, type DesktopOs, type TauriPluginName, type TauriPlugins } from '../../shared/native'

/**
 * The desktop shell: whether the app runs in Tauri, the OS, window controls and the installed Tauri packages. In a
 * browser and on the server `isDesktop` is `false`, `load()` resolves `null` and the window controls do nothing
 * (`openExternal` opens a new tab).
 */
export function useDesktop() {
  const isDesktop = import.meta.client && isTauri()
  const os: DesktopOs = import.meta.client ? detectOs(globalThis.navigator?.userAgent) : 'unknown'
  const config = useRuntimeConfig().public.desktop

  async function load<K extends TauriPluginName>(name: K): Promise<TauriPlugins[K] | null> {
    const loader = plugins[name] as (() => Promise<TauriPlugins[K]>) | null
    if (!isDesktop || !loader) return null
    return loader()
  }

  async function withWindow(action: (window: ReturnType<TauriPlugins['window']['getCurrentWindow']>) => Promise<void>): Promise<void> {
    const module = await load('window')
    if (module) await action(module.getCurrentWindow())
  }

  return {
    isDesktop,
    os,
    isMacos: isDesktop && os === 'macos',
    isWindows: isDesktop && os === 'windows',
    isLinux: isDesktop && os === 'linux',
    /** Whether the Tauri package is installed (it is still unavailable in a browser). */
    has: (name: TauriPluginName): boolean => !!plugins[name],
    /** The Tauri package in the desktop app, `null` in a browser or when it is not installed. */
    load,
    /** The running app's version (`@tauri-apps/api/app`), else the configured `desktop.version`. */
    async getVersion(): Promise<string> {
      const app = await load('app')
      return (await app?.getVersion().catch(() => undefined)) ?? config.version
    },
    minimize: () => withWindow(window => window.minimize()),
    maximize: () => withWindow(window => window.maximize()),
    unmaximize: () => withWindow(window => window.unmaximize()),
    toggleMaximize: () => withWindow(window => window.toggleMaximize()),
    close: () => withWindow(window => window.close()),
    setFullscreen: (fullscreen: boolean) => withWindow(window => window.setFullscreen(fullscreen)),
    /** Brings the window to the front (`core:window:allow-set-focus`). */
    focus: () => withWindow(window => window.setFocus()),
    /** Opens a link in the user's default browser (`@tauri-apps/plugin-opener`), or a new tab outside the desktop app. */
    async openExternal(url: string): Promise<void> {
      const opener = await load('opener')
      if (opener) return opener.openUrl(url)
      if (import.meta.client) globalThis.open?.(url, '_blank', 'noopener,noreferrer')
    },
  }
}
