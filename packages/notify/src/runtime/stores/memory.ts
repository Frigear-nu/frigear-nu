import type { NotificationStore, StoredNotification } from '../../types'

export const memoryStore = (): NotificationStore => {
  const notifications: StoredNotification[] = []
  return {
    async put(notification) {
      const existingIndex = notifications.findIndex(n => n.id === notification.id)
      if (existingIndex !== -1) {
        notifications[existingIndex] = notification
      }
      else {
        notifications.push(notification)
      }
    },
    async get(id) {
      return notifications.find(n => n.id === id) || null
    },
    async list() {
      return [...notifications]
    },
    async delete(id) {
      const index = notifications.findIndex(n => n.id === id)
      if (index !== -1) {
        notifications.splice(index, 1)
      }
    },
  }
}
