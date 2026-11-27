import { getCurrentInstance, onActivated, onBeforeUnmount, onDeactivated } from '#imports'
import { useRefreshRegistry } from '../utils/refresh'

/**
 * Runs `callback` when the user pulls to refresh while the calling page is on screen (not while a kept-alive page is in
 * the background). The spinner stays until it resolves. `useAsyncData` / `useFetch` data is refreshed already; this is
 * for anything else, such as a store or data fetched by hand:
 *
 * ```ts
 * onMobileRefresh(() => store.reload())
 * ```
 *
 * Returns a function that removes it.
 */
export function onMobileRefresh(callback: () => unknown): () => void {
  const registry = useRefreshRegistry()
  const add = () => void registry.add(callback)
  const remove = () => void registry.delete(callback)
  add()
  if (getCurrentInstance()) {
    onActivated(add)
    onDeactivated(remove)
    onBeforeUnmount(remove)
  }
  return remove
}
