import type { CaptchaConfig, CaptchaProvider, FormField } from '../../types'

export const captchaProviders: CaptchaProvider[] = ['turnstile', 'recaptcha', 'hcaptcha']

/** A configured provider name, or `turnstile` when it is missing or not a known provider. */
export function normalizeCaptchaProvider(value: unknown): CaptchaProvider {
  return captchaProviders.includes(value as CaptchaProvider) ? value as CaptchaProvider : 'turnstile'
}

/**
 * Provider and (optional) site key override of a captcha field. A field without a provider uses
 * `defaultProvider` (`runtimeConfig.public.forms.captcha.defaultProvider`), `turnstile` when omitted.
 */
export function resolveCaptcha(field: Pick<FormField, 'captcha'>, defaultProvider?: unknown): Required<Pick<CaptchaConfig, 'provider'>> & CaptchaConfig {
  return { ...field.captcha, provider: field.captcha?.provider ?? normalizeCaptchaProvider(defaultProvider) }
}
