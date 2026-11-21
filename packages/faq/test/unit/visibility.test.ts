import { describe, expect, it } from 'vitest'
import { createViewer } from '@frigear-nu/audience'
import { isFaqItemPublic, isFaqItemVisible, normalizeVisibility } from '../../src/runtime/utils'

const anonymous = createViewer()
const member = createViewer({ userId: 1 })
const supervisor = createViewer({ userId: 2, globalRoles: ['supervisor'] })

describe('the visibility of an item in its group', () => {
  it('is the group\'s when the item is empty (null or {})', () => {
    expect(isFaqItemVisible({ visibility: { public: true } }, { visibility: null }, anonymous)).toBe(true)
    expect(isFaqItemVisible({ visibility: { public: true } }, { visibility: {} }, anonymous)).toBe(true)
    expect(isFaqItemVisible({ visibility: null }, { visibility: null }, anonymous)).toBe(false)
    expect(isFaqItemVisible({ visibility: null }, { visibility: null }, member)).toBe(true)
  })

  it('can narrow the group: a public group with a role-only item hides the item from visitors and other members', () => {
    const group = { visibility: { public: true } }
    expect(isFaqItemVisible(group, { visibility: { globalRoles: ['supervisor'] } }, anonymous)).toBe(false)
    expect(isFaqItemVisible(group, { visibility: { globalRoles: ['supervisor'] } }, member)).toBe(false)
    expect(isFaqItemVisible(group, { visibility: { globalRoles: ['supervisor'] } }, supervisor)).toBe(true)
  })

  it('can never widen the group: a public item in a restricted group stays restricted', () => {
    const group = { visibility: { globalRoles: ['supervisor'] } }
    expect(isFaqItemVisible(group, { visibility: { public: true } }, anonymous)).toBe(false)
    expect(isFaqItemVisible(group, { visibility: { public: true } }, member)).toBe(false)
    expect(isFaqItemVisible(group, { visibility: { public: true } }, supervisor)).toBe(true)
  })

  it('fails closed on a stored value with an unknown key', () => {
    expect(isFaqItemVisible({ visibility: { public: true } }, { visibility: { permission: 'x' } }, member)).toBe(false)
    expect(isFaqItemVisible({ visibility: { permission: 'x' } }, { visibility: null }, member)).toBe(false)
  })

  it('is public only when anonymous visitors read both', () => {
    expect(isFaqItemPublic({ visibility: { public: true } }, { visibility: null })).toBe(true)
    expect(isFaqItemPublic({ visibility: { public: true } }, { visibility: { globalRoles: ['supervisor'] } })).toBe(false)
    expect(isFaqItemPublic({ visibility: null }, { visibility: { public: true } })).toBe(false)
  })

  it('stores an empty visibility as null', () => {
    expect(normalizeVisibility({})).toBeNull()
    expect(normalizeVisibility(null)).toBeNull()
    expect(normalizeVisibility({ public: true })).toEqual({ public: true })
    expect(normalizeVisibility({ globalRoles: [] })).toEqual({ globalRoles: [] })
  })
})
