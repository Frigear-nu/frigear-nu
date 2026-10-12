import type { H3Event } from 'h3'
import type { CaptchaProvider, CaptchaVerifyContext } from '../../../types'

const VERIFY_URLS: Record<CaptchaProvider, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
}

/**
 * Verifies a captcha response token. The `forms:captcha:verify` hook runs first and can decide
 * (`ctx.valid`) without any network call; otherwise the provider's siteverify endpoint is asked with the
 * secret from `runtimeConfig.forms.captcha.<provider>.secretKey`. Fails closed: a provider without a
 * secret key, or an unreachable endpoint, is an error, never a pass.
 */
export async function verifyCaptcha(event: H3Event, provider: CaptchaProvider, token: string): Promise<boolean> {
  const ip = getRequestIP(event, { xForwardedFor: true })
  const ctx: CaptchaVerifyContext = { event, provider, token, ip, valid: undefined }
  await useNitroApp().hooks.callHook('forms:captcha:verify', ctx)
  if (ctx.valid !== undefined) return ctx.valid

  const secret = useRuntimeConfig(event).forms.captcha?.[provider]?.secretKey
  if (!secret) {
    console.error(`[forms] captcha provider "${provider}" has no secret key (NUXT_FORMS_CAPTCHA_${provider.toUpperCase()}_SECRET_KEY).`)
    throw createError({ statusCode: 500, statusMessage: `The ${provider} captcha is not configured on the server.`, data: { captcha: true } })
  }

  const body = new URLSearchParams({ secret, response: token })
  if (ip) body.set('remoteip', ip)
  try {
    const result = await $fetch<{ success?: boolean }>(VERIFY_URLS[provider], { method: 'POST', body, timeout: 10_000 })
    return result?.success === true
  }
  catch (cause) {
    console.error(`[forms] ${provider} verification request failed:`, cause)
    throw createError({ statusCode: 502, statusMessage: 'The captcha could not be verified. Please try again.', data: { captcha: true } })
  }
}
