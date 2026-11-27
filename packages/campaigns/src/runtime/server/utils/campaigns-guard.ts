import type { H3Event } from 'h3'
import { kv } from '@nuxthub/kv'
import { apiError, notConfigured } from '@frigear-nu/module-kit/server'
import type { CampaignCaptchaProvider } from '../../../types'

// What guards the anonymous subscribe route: a fixed-window rate limit per client and list (kept in KV, like forms'
// `enforceRateLimit`), and optionally a captcha, checked with forms' `verifyCaptcha` (registered by
// `plugins/forms-captcha.ts`, so this module does not import forms).

/** Signups per client and list: 429 `rate_limited` once `rateLimit` were made in the window. `rateLimit: 0` turns it off. */
export async function campaignsEnforceRateLimit(event: H3Event, slug: string): Promise<void> {
  const { rateLimit, rateLimitWindowSeconds } = campaignsConfig(event)
  if (!rateLimit) return
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const window = Math.floor(Date.now() / (rateLimitWindowSeconds * 1000))
  const key = `campaigns:rate:${slug}:${ip}:${window}`
  const used = Number(await kv.get<number>(key) ?? 0)
  if (used >= rateLimit) {
    setResponseHeader(event, 'retry-after', rateLimitWindowSeconds)
    throw apiError(429, 'rate_limited', 'Too many signups, try again later.')
  }
  await kv.set(key, used + 1, { ttl: rateLimitWindowSeconds })
}

export type CampaignsCaptchaVerifier = (event: H3Event, provider: CampaignCaptchaProvider, token: string) => Promise<boolean>

let verifier: CampaignsCaptchaVerifier | undefined

/** Sets how captcha responses are checked (`plugins/forms-captcha.ts` sets forms' `verifyCaptcha`). */
export function setCampaignsCaptchaVerifier(next: CampaignsCaptchaVerifier): void {
  verifier = next
}

/**
 * Checks the captcha response when the `captcha` option names a provider: 400 `captcha_required` without one, 400
 * `captcha_failed` when the provider says no. Fails closed: without a verifier it is 501 `not_configured`.
 */
export async function campaignsVerifyCaptcha(event: H3Event, token: string | undefined): Promise<void> {
  const { captcha } = campaignsConfig(event)
  if (!captcha) return
  if (!token) throw apiError(400, 'captcha_required', 'Complete the captcha to sign up.')
  if (!verifier) throw notConfigured('The captcha of the list signup is not set up: it needs @frigear-nu/forms.')
  if (!await verifier(event, captcha, token)) throw apiError(400, 'captcha_failed', 'The captcha could not be verified. Please try again.')
}
