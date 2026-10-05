import { useState } from '#imports'
import type { SimpleNotification } from '../../types'
import uiDriver from '#notify/ui-driver'

export const useNotifications = () => {
  const toast = useToast()
  const notifications = useState('notifications', () => [])

  const addNotification = (notification: SimpleNotification<{type?: }>) => {
    notifications.value.push(notification)
    return uiDriver(notification)
  }

  return {
    notifications,
    addNotification,
  }
}
