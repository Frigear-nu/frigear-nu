import emailDriver from '#notify/email-driver'
import type { EmailNotification } from '../../../types'
/**
 * Dispatches an email notification through the driver configured on the `@frigear-nu/notify`
 * module (`notify.email.driver`, see `#notify/email-driver`). Auto-imported wherever this module
 * is installed, so consumers (e.g. `@frigear-nu/users`) only ever build an `EmailNotification`
 * and call this - driver selection stays entirely with the app/consuming layer.
 */
export async function dispatchEmailNotification(notification: EmailNotification) {
  await emailDriver(notification)
}
