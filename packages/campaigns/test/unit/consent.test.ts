import { describe, expect, it } from 'vitest'
import { campaignConfirmable, campaignConsentProof, campaignShouldResendConfirm, campaignSubscribeAction } from '../../src/runtime/utils/consent'

const now = new Date('2026-11-26T12:00:00Z')

describe('consent proof', () => {
  it('is pending with an expiring confirmation under double opt-in', () => {
    const proof = campaignConsentProof({ source: 'form', consentVersion: 3, confirm: true, confirmTokenHash: 'hash', confirmTtlHours: 72, ipHash: 'ip', now })
    expect(proof).toEqual({
      status: 'pending',
      source: 'form',
      consentVersion: 3,
      requestedAt: now,
      confirmedAt: null,
      confirmTokenHash: 'hash',
      confirmExpiresAt: new Date('2026-11-29T12:00:00Z'),
      ipHash: 'ip',
      unsubscribedAt: null,
    })
  })

  it('is active and confirmed at once when there is nothing to confirm', () => {
    const proof = campaignConsentProof({ source: 'account', consentVersion: 1, confirm: false, confirmTokenHash: null, confirmTtlHours: 72, ipHash: null, now })
    expect(proof.status).toBe('active')
    expect(proof.confirmedAt).toEqual(now)
    expect(proof.requestedAt).toEqual(now)
    expect(proof.confirmTokenHash).toBeNull()
    expect(proof.confirmExpiresAt).toBeNull()
    expect(proof.source).toBe('account')
  })

  it('needs a token to confirm', () => {
    expect(() => campaignConsentProof({ source: 'form', consentVersion: 1, confirm: true, confirmTokenHash: null, confirmTtlHours: 72, ipHash: null, now })).toThrow()
  })
})

describe('signup decisions', () => {
  it('creates, renews or keeps', () => {
    expect(campaignSubscribeAction(undefined)).toBe('create')
    expect(campaignSubscribeAction('pending')).toBe('renew')
    expect(campaignSubscribeAction('unsubscribed')).toBe('renew')
    expect(campaignSubscribeAction('active')).toBe('keep')
  })

  it('resends a pending confirmation only after the pause', () => {
    const pending = { status: 'pending' as const, requestedAt: new Date(now.getTime() - 60_000) }
    expect(campaignShouldResendConfirm(pending, now, 300)).toBe(false)
    expect(campaignShouldResendConfirm(pending, now, 60)).toBe(true)
    expect(campaignShouldResendConfirm({ status: 'unsubscribed', requestedAt: now }, now, 300)).toBe(true)
  })

  it('confirms only a pending subscription before it expires', () => {
    const later = new Date(now.getTime() + 1000)
    expect(campaignConfirmable({ status: 'pending', confirmExpiresAt: later }, now)).toBe(true)
    expect(campaignConfirmable({ status: 'pending', confirmExpiresAt: now }, now)).toBe(false)
    expect(campaignConfirmable({ status: 'pending', confirmExpiresAt: null }, now)).toBe(false)
    expect(campaignConfirmable({ status: 'active', confirmExpiresAt: later }, now)).toBe(false)
  })
})
