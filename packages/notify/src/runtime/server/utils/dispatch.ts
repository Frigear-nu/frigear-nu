import smsDriver from '#notify/sms-driver'
import simpleDriver from '#notify/simple-driver'
import pushDriver from '#notify/push-driver'
import type {
  EmailNotification,
  EmailSendResult,
  NotifyEmailDispatchOptions,
  NotifyEmailContext,
  PushDispatchResult,
  PushNotification,
  SMSNotification,
  SimpleNotification,
} from '../../../types'
/**
 * Dispatches an email notification through the driver configured on the `@frigear-nu/notify`
 * module (`notify.email.driver`, see `#notify/email-driver`). Auto-imported wherever this module
 * is installed, so consumers (e.g. `@frigear-nu/users`) only ever build an `EmailNotification`
 * and call this - driver selection stays entirely with the app/consuming layer. `options.driver` sends this one email
 * through another built-in driver (configured from the same `NUXT_NOTIFY_EMAIL_*` settings), e.g. the inbox's replies
 * through `cloudflare-binding`. Resolves to what the driver reports (`messageId`), or `undefined`.
 */
export async function dispatchEmailNotification(notification: EmailNotification, options: NotifyEmailDispatchOptions = {}): Promise<EmailSendResult | undefined> {
  // Listeners (e.g. `@frigear-nu/email-templates`) may render `notification.template` here; with
  // none, the notification is sent exactly as it was built.
  const context: NotifyEmailContext = { notification }
  await useNitroApp().hooks.callHook('notify:email', context)
  if (options.driver) {
    const { isBuiltInEmailDriver, sendWithBuiltInEmailDriver } = await import('../../drivers/email/index')
    if (!isBuiltInEmailDriver(options.driver)) throw new Error(`[notify] Unknown email driver "${options.driver}" for this send.`)
    return (await sendWithBuiltInEmailDriver(context.notification, options.driver)) ?? undefined
  }
  const { default: emailDriver } = await import('#notify/email-driver')
  return (await emailDriver(context.notification)) ?? undefined
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

/**
 * Dispatches a push notification to the devices of `notification.userIds` through the driver configured on the
 * `@frigear-nu/notify` module (`notify.push.driver`, see `#notify/push-driver`; `@frigear-nu/push` when it is
 * installed). Auto-imported wherever this module is installed, so consumers only ever build a `PushNotification` and
 * call this. Resolves to what the driver reports (devices sent, failed), or `undefined` when it reports nothing (`log`).
 */
export async function dispatchPushNotification(notification: PushNotification): Promise<PushDispatchResult | undefined> {
  if (!notification.userIds.length) return { sent: 0, failed: 0 }
  return (await pushDriver(notification)) ?? undefined
}
