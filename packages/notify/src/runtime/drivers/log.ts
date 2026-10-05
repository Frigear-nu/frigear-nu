import type { EmailDriver } from '../../types'

/**
 * Logs the notification instead of sending it. Safe default for development/unconfigured setups,
 * and a reference implementation for the `EmailDriver` signature.
 */
export const logEmailDriver: EmailDriver = (notification) => {
  console.log('[notify] Dispatching email notification (log driver):', notification)
}
