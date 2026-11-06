import { computed, useNuxtApp } from '#imports'
import { splashControllers } from '../utils/splash'
import { useSplashVisible } from '../utils/state'

/**
 * The splash screen. It hides once the first page has rendered; the app keeps it up for anything else it needs
 * first (the sign-in state, a first fetch) with `hold()` or `waitFor()`, from a plugin, `app.vue` or route middleware.
 * With the splash screen off (`mobile.splashScreen: false`) every call is a no-op.
 */
export function useMobileSplash() {
  const visible = useSplashVisible()
  const controller = splashControllers.get(useNuxtApp())
  return {
    /** Whether the splash screen is up. */
    visible: computed(() => visible.value),
    /** Keeps the splash screen up until the returned function is called. */
    hold: (): (() => void) => controller?.hold() ?? (() => {}),
    /** Keeps the splash screen up until the promise settles; returns the promise. */
    waitFor: <T>(promise: Promise<T>): Promise<T> => controller ? controller.waitFor(promise) : promise,
    /** Hides the splash screen now, whatever holds it. */
    hide: (): void => controller?.hide(),
  }
}
