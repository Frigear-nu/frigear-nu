import { describe, expect, it } from 'vitest'
import { createViewer } from '@frigear-nu/audience'
import { categoryChain, isHelpArticlePublic, isHelpArticleVisible, isHelpArticleVisibleIn, isHelpChainVisible, normalizeVisibility } from '../../src/runtime/utils'

const anonymous = createViewer()
const member = createViewer({ userId: 1 })
const supervisor = createViewer({ userId: 2, globalRoles: ['supervisor'] })

describe('the visibility of an article in its category', () => {
  it('is the category\'s when the article is empty (null or {})', () => {
    expect(isHelpArticleVisible({ visibility: { public: true } }, { visibility: null }, anonymous)).toBe(true)
    expect(isHelpArticleVisible({ visibility: { public: true } }, { visibility: {} }, anonymous)).toBe(true)
    expect(isHelpArticleVisible({ visibility: null }, { visibility: null }, anonymous)).toBe(false)
    expect(isHelpArticleVisible({ visibility: null }, { visibility: null }, member)).toBe(true)
  })

  it('can narrow the category: a public category with a role-only article hides it from visitors and other members', () => {
    const category = { visibility: { public: true } }
    expect(isHelpArticleVisible(category, { visibility: { globalRoles: ['supervisor'] } }, anonymous)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { globalRoles: ['supervisor'] } }, member)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { globalRoles: ['supervisor'] } }, supervisor)).toBe(true)
  })

  it('can never widen the category: a public article in a restricted category stays restricted', () => {
    const category = { visibility: { globalRoles: ['supervisor'] } }
    expect(isHelpArticleVisible(category, { visibility: { public: true } }, anonymous)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { public: true } }, member)).toBe(false)
    expect(isHelpArticleVisible(category, { visibility: { public: true } }, supervisor)).toBe(true)
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

describe('categories below categories', () => {
  const node = (id: string, parentId: string | null, visibility: unknown) => ({ id, parentId, visibility })
  const nodes = [node('top', null, { globalRoles: ['supervisor'] }), node('mid', 'top', { public: true }), node('leaf', 'mid', null), node('orphan', 'gone', null)]
  const byId = new Map(nodes.map(entry => [entry.id, entry]))

  it('walks from a category up to the top', () => {
    expect(categoryChain(byId.get('leaf')!, byId).map(entry => entry.id)).toEqual(['leaf', 'mid', 'top'])
    expect(categoryChain(byId.get('top')!, byId).map(entry => entry.id)).toEqual(['top'])
  })

  it('counts a category whose parent is gone as top level, and cuts a loop', () => {
    expect(categoryChain(byId.get('orphan')!, byId).map(entry => entry.id)).toEqual(['orphan'])
    const loop = new Map([['a', node('a', 'b', null)], ['b', node('b', 'a', null)]])
    expect(categoryChain(loop.get('a')!, loop).map(entry => entry.id)).toEqual(['a', 'b'])
  })

  it('is visible only when every category in the chain is: a child narrows its parent and never widens it', () => {
    const chain = categoryChain(byId.get('mid')!, byId)
    // `mid` says public, `top` says supervisors: visitors and other members stay out.
    expect(isHelpChainVisible(chain, anonymous)).toBe(false)
    expect(isHelpChainVisible(chain, member)).toBe(false)
    expect(isHelpChainVisible(chain, supervisor)).toBe(true)
    expect(isHelpArticleVisibleIn(chain, { visibility: { public: true } }, anonymous)).toBe(false)
    expect(isHelpArticleVisibleIn(chain, { visibility: null }, supervisor)).toBe(true)
    expect(isHelpArticleVisibleIn(chain, { visibility: { globalRoles: ['other'] } }, supervisor)).toBe(false)
  })

  it('lets an ancestor that is public leave the child to its own rule', () => {
    const open = new Map([['p', node('p', null, { public: true })], ['c', node('c', 'p', { globalRoles: ['supervisor'] })]])
    const chain = categoryChain(open.get('c')!, open)
    expect(isHelpChainVisible(chain, anonymous)).toBe(false)
    expect(isHelpChainVisible(chain, supervisor)).toBe(true)
  })
})
