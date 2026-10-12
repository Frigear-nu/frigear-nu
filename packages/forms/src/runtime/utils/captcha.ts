import type { CaptchaConfig, CaptchaProvider, FormField } from '../../types'

export const captchaProviders: CaptchaProvider[] = ['turnstile', 'recaptcha', 'hcaptcha']

/** Provider and (optional) site key override of a captcha field, with the provider defaulted. */
export function resolveCaptcha(field: Pick<FormField, 'captcha'>): Required<Pick<CaptchaConfig, 'provider'>> & CaptchaConfig {
  return { ...field.captcha, provider: field.captcha?.provider ?? 'turnstile' }
}
