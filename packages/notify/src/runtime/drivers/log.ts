import type { SimpleNotification, SMSNotification, EmailNotification, PushNotification } from '../../types'

/**
 * Logs the notification instead of sending it. Safe default for development/unconfigured setups,
 * and a reference implementation for the driver signatures.
 */
export const logDriver = (notification: SimpleNotification | SMSNotification | EmailNotification | PushNotification) => {
  console.log('[notify] Dispatching notification:', notification)
}

export default logDriver
