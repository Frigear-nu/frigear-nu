import { computed, useRoute, useRuntimeConfig } from '#imports'
import { useOAuth } from '#mobile/optional'
import { plugins } from '#mobile/native'
import type { MobilePageMeta } from '../../../types'
import { resolveChrome, type ChromeState } from '../../shared/chrome'
import { useOverlayCount, useSuppressCount } from '../utils/state'
import { useMobileTranslate } from '../utils/translate'
import { useCapacitor } from './useCapacitor'
import { useMobileTabs } from './useMobileTabs'

/**
 * What the shell shows on the current route: native or web chrome, the visible tabs, the selected one, whether the
 * tab bar shows and the title. `MobileHeader`, `MobileTabBar` and the native bars all read it.
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
  const oauth = config.auth && typeof useOAuth === 'function' ? useOAuth() : undefined

  const state = computed<ChromeState>(() => resolveChrome({
    platform,
    nativeChrome: config.nativeChrome,
    nativeNavigation: !!plugins.nativeNavigation,
    tabs: tabs.value,
    path: route.path,
    page: route.meta.mobile as MobilePageMeta | undefined,
    // Unknown (still restoring the session) counts as signed out, so signed-in tabs never flash.
    authenticated: oauth ? oauth.authenticated.value : null,
    overlays: overlays.value,
    suppressed: suppressed.value,
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
