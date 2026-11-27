import { base64UrlToBytes, bytesToBase64Url, bytesToHex, sha256Hex } from '@frigear-nu/module-kit/crypto'
import { randomToken } from '@frigear-nu/module-kit/id'

// Two kinds of token go out in messages:
//
// - The confirmation token: random, shown once (in the confirmation message), stored as its SHA-256 on the subscription
//   and cleared once used.
// - The unsubscribe token: `<subject>.<signature>`, where the subject is the id of what it unsubscribes (`cms_…`, a
//   subscription) and the signature an HMAC-SHA-256 of it under the module's signing key. Nothing is stored per token,
//   so every message to a subscriber, now or later, can carry one, and campaign deliveries can sign their own ids the
//   same way.

const encoder = new TextEncoder()

/** The id shapes an unsubscribe token may name: `<3 letters>_<32 hex>` (`cms_…` for a subscription). */
const SUBJECT = /^[a-z]{3}_[0-9a-f]{32}$/

/** The prefix of subscription ids: a token for one is in the confirmation message and the subscription's own links. */
export const CAMPAIGN_SUBSCRIPTION_PREFIX = 'cms'

/**
 * The prefix of delivery ids: a token for one is in every campaign message, as the subject of its short links, in the
 * open pixel and in its unsubscribe links.
 */
export const CAMPAIGN_DELIVERY_PREFIX = 'cmd'

export type CampaignTokenKind = 'subscription' | 'delivery'

/** What a (verified) token's subject names, by its prefix; `null` for anything else. */
export function campaignTokenKind(subject: string | null | undefined): CampaignTokenKind | null {
  if (!subject || !SUBJECT.test(subject)) return null
  if (subject.startsWith(`${CAMPAIGN_SUBSCRIPTION_PREFIX}_`)) return 'subscription'
  if (subject.startsWith(`${CAMPAIGN_DELIVERY_PREFIX}_`)) return 'delivery'
  return null
}

/** SHA-256 (hex) of a confirmation token: what `campaign_subscriptions.confirmTokenHash` stores. */
export function campaignsHashToken(token: string): Promise<string> {
  return sha256Hex(token)
}

/** A new confirmation token (shown once, in the message) and its hash. */
export async function campaignsNewConfirmToken(): Promise<{ token: string, hash: string }> {
  const token = randomToken(32)
  return { token, hash: await campaignsHashToken(token) }
}

const unsubscribePayload = (subject: string) => encoder.encode(`campaigns:unsubscribe:${subject}`)

/** The unsubscribe token of `subject` (a subscription id), signed with `key` (an HMAC-SHA-256 key). */
export async function signUnsubscribeToken(key: CryptoKey, subject: string): Promise<string> {
  if (!SUBJECT.test(subject)) throw new Error(`[campaigns] "${subject}" cannot be the subject of an unsubscribe token.`)
  const signature = await crypto.subtle.sign('HMAC', key, unsubscribePayload(subject))
  return `${subject}.${bytesToBase64Url(signature)}`
}

/** Splits an unsubscribe token into its subject and signature, or `null` when it is not shaped like one. */
export function parseUnsubscribeToken(token: string): { subject: string, signature: string } | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const subject = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!SUBJECT.test(subject) || !/^[\w-]{43}$/.test(signature)) return null
  return { subject, signature }
}

/** The subject of a valid unsubscribe token (one `key` signed), or `null` when it is not one, forged or altered. */
export async function verifyUnsubscribeToken(key: CryptoKey, token: string): Promise<string | null> {
  const parsed = parseUnsubscribeToken(token)
  if (!parsed) return null
  let signature: Uint8Array<ArrayBuffer>
  try {
    signature = base64UrlToBytes(parsed.signature)
  }
  catch {
    return null
  }
  const valid = await crypto.subtle.verify('HMAC', key, signature, unsubscribePayload(parsed.subject))
  return valid ? parsed.subject : null
}

/** A keyed hash (HMAC-SHA-256, hex) of an IP address, for the consent proof: the address itself is never stored. */
export async function hashIp(key: CryptoKey, ip: string): Promise<string> {
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`campaigns:ip:${ip}`)))
}
