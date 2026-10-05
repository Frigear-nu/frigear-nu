import { useState } from '#imports'
import type { UINotification } from '../../../types'
import uiDriver from '#notify/ui-driver'

/**
 * App-side composable for pushing `UINotification`s through the configured UI driver (e.g. the
 * `@nuxt/ui` driver, which forwards them to `useToast`). Only registered when `notify.ui.driver`
 * is configured - see `setup()` in the module.
 */
export const useNotify = () => {
  const notifications = useState<UINotification[]>('notify-notifications', () => [])
  // `uiDriver` is a composable factory - call it once, synchronously, here (guaranteed to run
  // during the calling component's `setup()`, since `useNotify` is itself a composable) so driver
  // implementations relying on Vue's `inject()` (e.g. the `@nuxt/ui` driver's `useToast()`) can
  // resolve correctly, rather than failing when a notification is dispatched later/async.
  const dispatch = uiDriver()

  const add = (notification: UINotification) => {
    notifications.value.push(notification)
    return dispatch(notification)
  }

  return {
    notifications,
    // `addNotification` is an alias for `add` to make the API more explicit and self-documenting
    addNotification: add,
    add,
  }
}
