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

  const addNotification = (notification: UINotification) => {
    notifications.value.push(notification)
    return uiDriver(notification)
  }

  return {
    notifications,
    addNotification,
  }
}
