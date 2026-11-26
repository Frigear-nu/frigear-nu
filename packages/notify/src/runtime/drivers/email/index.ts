import { useRuntimeConfig } from '#imports'
import type { EmailDriver, EmailNotification, NotifyRuntimeConfig } from '../../../types'
import { logDriver } from '../log'

export const EMAIL_DRIVER_NAMES = ['log', 'resend', 'ses', 'cloudflare', 'cloudflare-binding'] as const
export type BuiltInEmailDriverName = typeof EMAIL_DRIVER_NAMES[number]

/** Whether `name` is a built-in email driver. */
export function isBuiltInEmailDriver(name: string): name is BuiltInEmailDriverName {
  return (EMAIL_DRIVER_NAMES as readonly string[]).includes(name)
}

/**
 * Sends through the built-in driver `name` (default: `NUXT_NOTIFY_EMAIL_DRIVER`), configured from
 * `runtimeConfig.notify.email`. Only that driver's code is loaded.
 */
export async function sendWithBuiltInEmailDriver(notification: EmailNotification, name?: string) {
  const config: Partial<NotifyRuntimeConfig['email']> = (useRuntimeConfig() as { notify?: Partial<NotifyRuntimeConfig> }).notify?.email ?? {}
  return sendWith(name || config.driver || 'log', config, notification)
}

/**
 * Default `#notify/email-driver`. Environment variables only exist at runtime, so the concrete
 * driver is chosen per send from `runtimeConfig.notify.email` (`NUXT_NOTIFY_EMAIL_DRIVER`), and
 * only that driver's code is loaded.
 */
const autoDriver: EmailDriver = notification => sendWithBuiltInEmailDriver(notification)

async function sendWith(name: string, config: Partial<NotifyRuntimeConfig['email']>, notification: EmailNotification) {
  const base = { from: config.from }

  switch (name) {
    case 'log':
      return logDriver(notification)
    case 'resend':
      return (await import('./resend')).createResendDriver({ ...base, ...config.resend })(notification)
    case 'ses':
      return (await import('./ses')).createSesDriver({ ...base, ...config.ses })(notification)
    case 'cloudflare':
      return (await import('./cloudflare')).createCloudflareDriver({ ...base, ...config.cloudflare })(notification)
    case 'cloudflare-binding':
      return (await import('./cloudflare-binding')).createCloudflareBindingDriver({ ...base, ...config.binding })(notification)
    default:
      throw new Error(`[notify] Unknown email driver "${name}" (NUXT_NOTIFY_EMAIL_DRIVER). Expected one of: ${EMAIL_DRIVER_NAMES.join(', ')}`)
  }
}

export default autoDriver
