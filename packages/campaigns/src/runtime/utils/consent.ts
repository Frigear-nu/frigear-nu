import type { CampaignChannel, CampaignSubscriptionSource, CampaignSubscriptionStatus } from '../../types'

// The consent proof a subscription keeps: where the consent came from, which version of the list's consent text the
// person agreed to, when they asked, when they confirmed, and a keyed hash of the IP address they asked from.

export type CampaignConsentProofInput = {
  source: CampaignSubscriptionSource
  /** The list's `consentVersion` the person was shown. */
  consentVersion: number
  /** `false` when the address is already proven (no double opt-in on the list, or a signed-in user's verified email). */
  confirm: boolean
  /** The hash of the new confirmation token; needed when `confirm` is `true`. */
  confirmTokenHash: string | null
  confirmTtlHours: number
  ipHash: string | null
  now: Date
}

/** The columns a new (or renewed) subscription is written with. */
export type CampaignConsentProof = {
  status: CampaignSubscriptionStatus
  source: CampaignSubscriptionSource
  consentVersion: number
  requestedAt: Date
  confirmedAt: Date | null
  confirmTokenHash: string | null
  confirmExpiresAt: Date | null
  ipHash: string | null
  unsubscribedAt: null
}

/**
 * The status and consent proof of a signup: `pending` with a confirmation token that expires after
 * `confirmTtlHours`, or `active` at once (confirmed now) when there is nothing to confirm.
 */
export function campaignConsentProof(input: CampaignConsentProofInput): CampaignConsentProof {
  if (input.confirm && !input.confirmTokenHash) throw new Error('[campaigns] a subscription to confirm needs a confirmation token.')
  const base = {
    source: input.source,
    consentVersion: input.consentVersion,
    requestedAt: input.now,
    ipHash: input.ipHash,
    unsubscribedAt: null,
  }
  if (!input.confirm) return { ...base, status: 'active', confirmedAt: input.now, confirmTokenHash: null, confirmExpiresAt: null }
  return {
    ...base,
    status: 'pending',
    confirmedAt: null,
    confirmTokenHash: input.confirmTokenHash,
    confirmExpiresAt: new Date(input.now.getTime() + input.confirmTtlHours * 3600_000),
  }
}

/**
 * What a signup does to the subscription a contact may already have on that list and channel: `create` a new one,
 * `renew` a pending or unsubscribed one (new consent, a new confirmation), or `keep` an active one as it is.
 */
export function campaignSubscribeAction(existing: CampaignSubscriptionStatus | undefined): 'create' | 'renew' | 'keep' {
  if (!existing) return 'create'
  return existing === 'active' ? 'keep' : 'renew'
}

/**
 * Whether a renewed signup of a subscription still waiting to confirm sends the confirmation again: only once
 * `resendAfterSeconds` passed since the last request, so a script cannot flood somebody's inbox through the form.
 */
export function campaignShouldResendConfirm(existing: { status: CampaignSubscriptionStatus, requestedAt: Date }, now: Date, resendAfterSeconds: number): boolean {
  if (existing.status !== 'pending') return true
  return now.getTime() - existing.requestedAt.getTime() >= resendAfterSeconds * 1000
}

/** Whether a subscription can be confirmed now: pending, with a confirmation that has not expired. */
export function campaignConfirmable(subscription: { status: CampaignSubscriptionStatus, confirmExpiresAt: Date | null }, now: Date): boolean {
  return subscription.status === 'pending' && !!subscription.confirmExpiresAt && subscription.confirmExpiresAt.getTime() > now.getTime()
}

/** The channels of a signup: asked for (all the list offers when left out), offered by the list, and given an address. */
export function campaignSignupChannels(list: { channels: CampaignChannel[] }, signup: { email?: string, phone?: string, channels?: CampaignChannel[] }): CampaignChannel[] {
  const asked = signup.channels ?? list.channels
  return list.channels.filter(channel => asked.includes(channel) && (channel === 'email' ? !!signup.email : !!signup.phone))
}
