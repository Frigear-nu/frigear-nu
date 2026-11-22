import { describe, expect, it } from 'vitest'
import { hasPublicGrant } from '@frigear-nu/auth/grants'
import { categoryChain, helpArticleInherits, isHelpArticlePublic, isHelpArticleReadableIn, isHelpChainPublic, isHelpChainReadable } from '../../src/runtime/utils'

const PUBLIC = [{ kind: 'public' }]
const SUPERVISORS = [{ kind: 'role', role: 'supervisor' }]

// Stands in for `grantsCanRead`: `public` admits anyone, `role` grants admit the roles the reader holds.
const reader = (roles: string[]) => async (record: { grants: unknown }) =>
  hasPublicGrant(record.grants) || (Array.isArray(record.grants) && record.grants.some((grant: { kind: string, role?: string }) => grant.kind === 'role' && roles.includes(grant.role ?? '')))
const anonymous = reader([])
const supervisor = reader(['supervisor'])

describe('an article in its category', () => {
  it('inherits the category when it has no list of its own', async () => {
    expect(helpArticleInherits({ grants: null })).toBe(true)
    expect(helpArticleInherits({ grants: [] })).toBe(false)
    expect(await isHelpArticleReadableIn([{ grants: PUBLIC }], { grants: null }, anonymous)).toBe(true)
    expect(await isHelpArticleReadableIn([{ grants: SUPERVISORS }], { grants: null }, anonymous)).toBe(false)
  })

  it('can narrow the category, never widen it', async () => {
    expect(await isHelpArticleReadableIn([{ grants: PUBLIC }], { grants: SUPERVISORS }, anonymous)).toBe(false)
    expect(await isHelpArticleReadableIn([{ grants: PUBLIC }], { grants: SUPERVISORS }, supervisor)).toBe(true)
    expect(await isHelpArticleReadableIn([{ grants: SUPERVISORS }], { grants: PUBLIC }, anonymous)).toBe(false)
    expect(await isHelpArticleReadableIn([{ grants: SUPERVISORS }], { grants: PUBLIC }, supervisor)).toBe(true)
  })

  it('admits nobody with an empty list, on the category or the article', async () => {
    expect(await isHelpArticleReadableIn([{ grants: [] }], { grants: null }, supervisor)).toBe(false)
    expect(await isHelpArticleReadableIn([{ grants: PUBLIC }], { grants: [] }, supervisor)).toBe(false)
  })

  it('is public only when anonymous visitors read the whole chain and the article', () => {
    expect(isHelpArticlePublic([{ grants: PUBLIC }], { grants: null })).toBe(true)
    expect(isHelpArticlePublic([{ grants: PUBLIC }], { grants: SUPERVISORS })).toBe(false)
    expect(isHelpArticlePublic([{ grants: SUPERVISORS }], { grants: PUBLIC })).toBe(false)
    expect(isHelpArticlePublic([{ grants: PUBLIC }, { grants: SUPERVISORS }], { grants: null })).toBe(false)
  })
})

describe('category chains', () => {
  const node = (id: string, parentId: string | null, grants: unknown) => ({ id, parentId, grants })

  it('walks up to the top, and cuts a missing parent or a loop', () => {
    const top = node('a', null, PUBLIC)
    const mid = node('b', 'a', SUPERVISORS)
    const leaf = node('c', 'b', PUBLIC)
    const byId = new Map([top, mid, leaf].map(entry => [entry.id, entry]))
    expect(categoryChain(leaf, byId).map(entry => entry.id)).toEqual(['c', 'b', 'a'])
    expect(categoryChain(node('d', 'missing', null), byId).map(entry => entry.id)).toEqual(['d'])
    const x = node('x', 'y', null)
    const y = node('y', 'x', null)
    expect(categoryChain(x, new Map([[x.id, x], [y.id, y]])).map(entry => entry.id)).toEqual(['x', 'y'])
  })

  it('is readable only when every category in it is: a subcategory narrows its parent', async () => {
    const chain = [node('c', 'b', PUBLIC), node('b', 'a', SUPERVISORS), node('a', null, PUBLIC)]
    expect(await isHelpChainReadable(chain, anonymous)).toBe(false)
    expect(await isHelpChainReadable(chain, supervisor)).toBe(true)
    expect(isHelpChainPublic(chain)).toBe(false)
    expect(isHelpChainPublic([node('a', null, PUBLIC)])).toBe(true)
    expect(await isHelpArticleReadableIn(chain, { grants: PUBLIC }, anonymous)).toBe(false)
    expect(await isHelpArticleReadableIn(chain, { grants: null }, supervisor)).toBe(true)
  })
})
