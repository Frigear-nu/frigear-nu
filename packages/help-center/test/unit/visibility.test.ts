import { describe, expect, it } from 'vitest'
import { createViewer } from '@frigear-nu/audience'
import { isHelpArticlePublic, isHelpArticleVisible, normalizeVisibility } from '../../src/runtime/utils'

const anonymous = createViewer()
const member = createViewer({ userId: 1 })
const barManager = createViewer({ userId: 2, globalRoles: ['barmanager'] })

describe('the visibility of an article in its category', () => {
  it('is the category\'s when the article is empty (null or {})', () => {
    expect(isHelpArticleVisible({ visibility: { public: true } }, { visibility: null }, anonymous)).toBe(true)
    expect(isHelpArticleVisible({ visibility: { public: true } }, { visibility: {} }, anonymous)).toBe(true)
    expect(isHelpArticleVisible({ visibility: null }, { visibility: null }, anonymous)).toBe(false)
    expect(isHelpArticleVisible({ visibility: null }, { visibility: null }, member)).toBe(true)
  })

  it('can narrow the category: a public category with a role-only article hides it from visitors and other members', () => {
    const category = { visibility: { public: true } }
    expect(isHelpArticleVisible(category, { visibility: { globalRoles: ['barmanager'] } }, anonymous)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { globalRoles: ['barmanager'] } }, member)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { globalRoles: ['barmanager'] } }, barManager)).toBe(true)
  })

  it('can never widen the category: a public article in a restricted category stays restricted', () => {
    const category = { visibility: { globalRoles: ['barmanager'] } }
    expect(isHelpArticleVisible(category, { visibility: { public: true } }, anonymous)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { public: true } }, member)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { public: true } }, barManager)).toBe(true)
  })

  it('fails closed on a stored value with an unknown key', () => {
    expect(isHelpArticleVisible({ visibility: { permission: 'x' } }, { visibility: null }, member)).toBe(false)
    expect(isHelpArticleVisible({ visibility: null }, { visibility: { permission: 'x' } }, member)).toBe(false)
  })

  it('knows when an anonymous visitor reads it', () => {
    expect(isHelpArticlePublic({ visibility: { public: true } }, { visibility: null })).toBe(true)
    expect(isHelpArticlePublic({ visibility: { public: true } }, { visibility: { globalRoles: ['x'] } })).toBe(false)
    expect(isHelpArticlePublic({ visibility: null }, { visibility: { public: true } })).toBe(false)
  })

  it('stores an empty visibility as null', () => {
    expect(normalizeVisibility({})).toBeNull()
    expect(normalizeVisibility(undefined)).toBeNull()
    expect(normalizeVisibility({ public: true })).toEqual({ public: true })
    expect(normalizeVisibility({ globalRoles: ['x'] })).toEqual({ globalRoles: ['x'] })
  })
})
