import type { SimpleNotification, UINotification, SMSNotification, EmailNotification, UIDriver } from '../../types'

/**
 * Logs the notification instead of sending it. Safe default for development/unconfigured setups,
 * and a reference implementation for the `EmailDriver` signature.
 */
export const logDriver = (notification: SimpleNotification | UINotification | SMSNotification | EmailNotification) => {
  console.log('[notify] Dispatching notification:', notification)
}

/**
 * `UIDriver`-shaped version of `logDriver` - unlike the server-side drivers, UI drivers are
 * composable factories (see `UIDriver`'s doc comment), so this just wraps `logDriver` in one to
 * use as the built-in `'log'` UI driver. Doesn't call any Vue composables itself, so there's
 * nothing `inject()`-sensitive here - it works the same called eagerly or lazily.
 */
export const logUIDriver: UIDriver = () => notification => logDriver(notification)

export default logDriver
