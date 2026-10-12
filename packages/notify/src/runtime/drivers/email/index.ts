import { useRuntimeConfig } from '#imports'
import type { EmailDriver, NotifyRuntimeConfig } from '../../../types'
import { logDriver } from '../log'

export const EMAIL_DRIVER_NAMES = ['log', 'resend', 'ses', 'cloudflare'] as const

/**
 * Default `#notify/email-driver`. Environment variables only exist at runtime, so the concrete
 * driver is chosen per send from `runtimeConfig.notify.email` (`NUXT_NOTIFY_EMAIL_DRIVER`), and
 * only that driver's code is loaded.
 */
const autoDriver: EmailDriver = async (notification) => {
  const config: Partial<NotifyRuntimeConfig['email']> = (useRuntimeConfig() as { notify?: Partial<NotifyRuntimeConfig> }).notify?.email ?? {}
  const name = config.driver || 'log'
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
    default:
      throw new Error(`[notify] Unknown email driver "${name}" (NUXT_NOTIFY_EMAIL_DRIVER). Expected one of: ${EMAIL_DRIVER_NAMES.join(', ')}`)
  }
}

export default autoDriver
