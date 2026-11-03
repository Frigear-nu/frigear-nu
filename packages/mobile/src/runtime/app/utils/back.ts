import { navigateTo, useRouter } from '#imports'
import type { ChromeState } from '../../shared/chrome'

/**
 * The navbar back button: back when the app has an entry to go back to, else up to the selected tab's root (a page
 * opened directly, after a reload or by a `replace` navigation). Vue Router keeps the previous in-app entry in
 * `history.state.back`; `history.length` would also count other sites' entries in a browser.
 */
export function useMobileBack(state: () => ChromeState) {
  const router = useRouter()
  return () => {
    const previous = (window.history.state as { back?: unknown } | null)?.back
    if (previous) return router.back()
    return navigateTo(state().activeTab?.to ?? '/', { replace: true })
  }
}
