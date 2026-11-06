import { computed, useRoute, useRuntimeConfig } from '#imports'
import { useAuth } from '#mobile/optional'
import { plugins } from '#mobile/native'
import type { MobilePageMeta } from '../../../types'
import { resolveChrome, type ChromeState } from '../../shared/chrome'
import { useNavbarActionRegistry, useOverlayCount, useSplashVisible, useSuppressCount } from '../utils/state'
import { useMobileTranslate } from '../utils/translate'
import { useCapacitor } from './useCapacitor'
import { useMobileTabs } from './useMobileTabs'

/**
 * What the shell shows on the current route: native or web chrome, the visible tabs, the selected one, whether the
 * tab bar shows, the title and the navbar actions. `MobileHeader`, `MobileTabBar` and the native bars all read it.
 *
 * The tab bar hides while a dialog, slideover or drawer is open; `suppress()` hides it for overlays of your own
 * (call the returned function to release).
 */
export function useMobileChrome() {
  const config = useRuntimeConfig().public.mobile
  const route = useRoute()
  const { platform } = useCapacitor()
  const { tabs } = useMobileTabs()
  const translate = useMobileTranslate()
  const overlays = useOverlayCount()
  const suppressed = useSuppressCount()
  const splash = useSplashVisible()
  const navbarActions = useNavbarActionRegistry()
  const auth = config.auth && typeof useAuth === 'function' ? useAuth() : undefined

  const state = computed<ChromeState>(() => resolveChrome({
    platform,
    nativeChrome: config.nativeChrome,
    nativeNavigation: !!plugins.nativeNavigation,
    tabs: tabs.value,
    path: route.path,
    page: route.meta.mobile as MobilePageMeta | undefined,
    actions: [...navbarActions.values()].filter(entry => entry.path() === route.path).flatMap(entry => entry.actions()),
    // Unknown (still restoring the session) counts as signed out, so signed-in tabs never flash.
    authenticated: auth ? auth.authenticated.value : null,
    overlays: overlays.value,
    suppressed: suppressed.value,
    splash: splash.value,
    appName: config.appName,
    translate,
  }))

  return {
    state,
    native: computed(() => state.value.mode === 'native'),
    /** Hides the tab bar until the returned function is called. */
    suppress(): () => void {
      suppressed.value++
      let released = false
      return () => {
        if (released) return
        released = true
        suppressed.value = Math.max(0, suppressed.value - 1)
      }
    },
  }
}
