import { plugins } from '#mobile/native'
import { getPlatform, type NativePluginName, type NativePlugins } from '../../shared/native'

/**
 * The platform, synchronously (`window.Capacitor` is set by the native bridge before the app runs), and the installed
 * native plugins. On the server and in a browser `platform` is `web` and `load()` resolves `null`.
 */
export function useCapacitor() {
  const platform = import.meta.client ? getPlatform() : 'web'
  return {
    platform,
    isNative: platform !== 'web',
    isIos: platform === 'ios',
    isAndroid: platform === 'android',
    /** Whether the plugin is installed (it may still be unavailable in a browser). */
    has: (name: NativePluginName): boolean => !!plugins[name],
    /** The plugin on a device, `null` in a browser or when it is not installed. */
    async load<K extends NativePluginName>(name: K): Promise<NativePlugins[K] | null> {
      const loader = plugins[name] as (() => Promise<NativePlugins[K]>) | null
      if (platform === 'web' || !loader) return null
      return loader()
    },
  }
}
