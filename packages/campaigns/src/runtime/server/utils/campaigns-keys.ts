import type { H3Event } from 'h3'
import { deriveHkdfKey, notConfigured } from '@frigear-nu/module-kit/server'
import { resolveSecret } from '@frigear-nu/module-kit/secret'
import type { CampaignsRuntimeConfig } from '../../../types'
import { hashIp, signUnsubscribeToken, verifyUnsubscribeToken } from '../../utils/tokens'

// The signing key of unsubscribe links and IP hashes: `campaigns.signingKey` (`NUXT_CAMPAIGNS_SIGNING_KEY`) when set,
// else one derived from Nuxt's `appSecret` (`NUXT_APP_SECRET`). The two uses get keys of their own (HKDF).

const SIGNING_PURPOSE = '@frigear-nu/campaigns:signing'
const keys = new Map<string, Promise<CryptoKey>>()

/** The module's server config. */
export function campaignsConfig(event?: H3Event): CampaignsRuntimeConfig {
  return (useRuntimeConfig(event) as unknown as { campaigns: CampaignsRuntimeConfig }).campaigns
}

async function campaignsKey(event: H3Event | undefined, info: 'campaigns_unsubscribe_tokens' | 'campaigns_ip_hashes'): Promise<CryptoKey | null> {
  const secret = await resolveSecret(SIGNING_PURPOSE, campaignsConfig(event).signingKey)
  if (!secret) return null
  const id = `${info}:${secret}`
  let key = keys.get(id)
  if (!key) {
    key = deriveHkdfKey(secret, { salt: '@frigear-nu/campaigns', info }, { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify'])
    keys.set(id, key)
  }
  return key
}

const missingKey = () => notConfigured('Newsletters are not set up: set NUXT_APP_SECRET (or NUXT_CAMPAIGNS_SIGNING_KEY) on the server.')

/** 501 `not_configured` unless there is a signing key: checked before a signup writes anything. */
export async function campaignsRequireSigningKey(event: H3Event | undefined): Promise<void> {
  if (!await campaignsKey(event, 'campaigns_unsubscribe_tokens')) throw missingKey()
}

/** The unsubscribe token of a subscription (`cms_…`): every message to that subscriber can carry it. */
export async function campaignsUnsubscribeToken(event: H3Event | undefined, subscriptionId: string): Promise<string> {
  const key = await campaignsKey(event, 'campaigns_unsubscribe_tokens')
  if (!key) throw missingKey()
  return signUnsubscribeToken(key, subscriptionId)
}

/** The id an unsubscribe token was made for, or `null` when it is not one of ours (forged, altered, cut short). */
export async function campaignsVerifyUnsubscribeToken(event: H3Event | undefined, token: string): Promise<string | null> {
  const key = await campaignsKey(event, 'campaigns_unsubscribe_tokens')
  if (!key) throw missingKey()
  return verifyUnsubscribeToken(key, token)
}

/** A keyed hash of the request's IP address for the consent proof, or `null` without an address or a key. */
export async function campaignsIpHash(event: H3Event): Promise<string | null> {
  const ip = getRequestIP(event, { xForwardedFor: true })
  if (!ip) return null
  const key = await campaignsKey(event, 'campaigns_ip_hashes')
  return key ? hashIp(key, ip) : null
}
