import emailDriver from '#notify/email-driver'
import smsDriver from '#notify/sms-driver'
import simpleDriver from '#notify/simple-driver'
import type { EmailNotification, SMSNotification, SimpleNotification } from '../../../types'
/**
 * Dispatches an email notification through the driver configured on the `@frigear-nu/notify`
 * module (`notify.email.driver`, see `#notify/email-driver`). Auto-imported wherever this module
 * is installed, so consumers (e.g. `@frigear-nu/users`) only ever build an `EmailNotification`
 * and call this - driver selection stays entirely with the app/consuming layer.
 */
export async function dispatchEmailNotification(notification: EmailNotification) {
  await emailDriver(notification)
}

/**
 * Dispatches an SMS notification through the driver configured on the `@frigear-nu/notify`
 * module (`notify.sms.driver`, see `#notify/sms-driver`). Auto-imported wherever this module is
 * installed, so consumers only ever build an `SMSNotification` and call this - driver selection
 * stays entirely with the app/consuming layer.
 */
export async function dispatchSMSNotification(notification: SMSNotification) {
  await smsDriver(notification)
}

/**
 * Dispatches a generic, transport-agnostic notification through the driver configured on the
 * `@frigear-nu/notify` module (`notify.simple.driver`, see `#notify/simple-driver`). Auto-imported
 * wherever this module is installed, so consumers only ever build a `SimpleNotification` and call
 * this - driver selection stays entirely with the app/consuming layer.
 */
export async function dispatchSimpleNotification(notification: SimpleNotification) {
  await simpleDriver(notification)
}
