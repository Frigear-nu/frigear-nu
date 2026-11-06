import { getCurrentInstance, getCurrentScope, onActivated, onBeforeUnmount, onDeactivated, onScopeDispose, toValue, useRoute } from '#imports'
import type { MaybeRefOrGetter } from 'vue'
import type { MobileNavbarAction } from '../../../types'
import { useNavbarActionRegistry } from '../utils/state'

/**
 * Navbar buttons of the calling page, in the native navbar on iOS and in `MobileHeader` elsewhere. Pass a ref or a
 * getter for actions that change (a disabled Save, a count in the label). They show while the page is the current
 * one: added in setup (so server rendering has them), removed on unmount and while a kept-alive page is in the
 * background.
 *
 * ```ts
 * useMobileNavbarActions([
 *   { id: 'settings', label: 'Settings', icon: 'i-lucide-settings', sfSymbol: 'gearshape', to: '/settings' },
 * ])
 * ```
 *
 * Fixed actions can go in `definePageMeta({ mobile: { actions } })` instead. Returns a function that removes them.
 */
export function useMobileNavbarActions(actions: MaybeRefOrGetter<MobileNavbarAction[] | undefined>): () => void {
  const registry = useNavbarActionRegistry()
  // In a page this is the page's own route, which keeps its path while the next page transitions in.
  const route = useRoute()
  const key = Symbol('mobile:navbar-actions')
  const entry = { path: () => route.path, actions: () => toValue(actions) ?? [] }
  const add = () => void registry.set(key, entry)
  const remove = () => void registry.delete(key)

  add()
  if (getCurrentInstance()) {
    onActivated(add)
    onDeactivated(remove)
    onBeforeUnmount(remove)
  }
  else if (getCurrentScope()) {
    onScopeDispose(remove)
  }
  return remove
}
