import type { SimpleNotification, UINotification, SMSNotification, EmailNotification } from '../../types'

/**
 * Logs the notification instead of sending it. Safe default for development/unconfigured setups,
 * and a reference implementation for the `EmailDriver` signature.
 */
export const logDriver = (notification: SimpleNotification | UINotification | SMSNotification | EmailNotification) => {
  console.log('[notify] Dispatching notification:', notification)
}

export default logDriver
