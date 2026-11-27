import { refreshNuxtData, useNuxtApp } from '#imports'
import { runRefreshHandlers } from '../../shared/pull-to-refresh'

/**
 * The `onMobileRefresh()` handlers of the pages on screen. Kept on the app rather than in `useState`: they are
 * functions, which do not belong in the payload.
 */
export function useRefreshRegistry(): Set<() => unknown> {
  const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & { _mobileRefresh?: Set<() => unknown> }
  nuxtApp._mobileRefresh ??= new Set()
  return nuxtApp._mobileRefresh
}

/**
 * What a pull to refresh does: refetch every active `useAsyncData` / `useFetch` key (`refreshNuxtData()`), run the
 * `onMobileRefresh()` handlers of the pages on screen and the `mobile:refresh` hook, all at once. Resolves when all
 * have settled; one that fails does not stop the others.
 */
export function refreshMobilePage(nuxtApp = useNuxtApp()): Promise<void> {
  const handlers = nuxtApp.runWithContext(() => useRefreshRegistry())
  return runRefreshHandlers([
    () => nuxtApp.runWithContext(() => refreshNuxtData()),
    () => nuxtApp.callHook('mobile:refresh'),
    ...handlers,
  ])
}
