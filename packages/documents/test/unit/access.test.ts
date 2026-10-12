import { describe, expect, it } from 'vitest'
import { ancestorChain, isAccepted, safeFilename, subtreeIds, visibleDocumentIds } from '../../src/runtime/utils'

const items = [
  { id: 'root-open', parentId: null, audience: 'everyone' as const },
  { id: 'root-crew', parentId: null, audience: 'groups' as const },
  { id: 'in-open', parentId: 'root-open', audience: 'everyone' as const },
  { id: 'in-open-crew', parentId: 'root-open', audience: 'groups' as const },
  { id: 'in-crew-open', parentId: 'root-crew', audience: 'everyone' as const },
  { id: 'in-crew-crew', parentId: 'root-crew', audience: 'groups' as const },
  { id: 'nobody', parentId: null, audience: 'groups' as const },
]
const shares = new Map([
  ['root-crew', new Set(['crew'])],
  ['in-open-crew', new Set(['crew'])],
  ['in-crew-crew', new Set(['crew'])],
])
const see = (groupIds: string[], manager = false) =>
  [...visibleDocumentIds(items, shares, { manager, groupIds: new Set(groupIds) })].sort()

describe('visibleDocumentIds', () => {
  it('shows everyone-items to anyone and nothing shared with groups the user is not in', () => {
    expect(see([])).toEqual(['in-open', 'root-open'])
  })

  it('shows group-shared items (and their open children) to members', () => {
    expect(see(['crew'])).toEqual(['in-crew-crew', 'in-crew-open', 'in-open', 'in-open-crew', 'root-crew', 'root-open'])
  })

  it('lets a folder gate its contents: an open file in a hidden folder stays hidden', () => {
    expect(see([])).not.toContain('in-crew-open')
  })

  it('shows everything to managers, and an unshared item to nobody else', () => {
    expect(see([], true)).toHaveLength(items.length)
    expect(see(['crew'])).not.toContain('nobody')
  })

  it('hides items with a missing parent or a cycle instead of leaking them', () => {
    const broken = [
      { id: 'a', parentId: 'ghost', audience: 'everyone' as const },
      { id: 'b', parentId: 'c', audience: 'everyone' as const },
      { id: 'c', parentId: 'b', audience: 'everyone' as const },
    ]
    expect([...visibleDocumentIds(broken, new Map(), { manager: false, groupIds: new Set() })]).toEqual([])
  })
})

describe('ancestorChain / subtreeIds', () => {
  it('lists folders from the root down, and everything below a folder', () => {
    expect(ancestorChain(items, 'in-crew-open').map(item => item.id)).toEqual(['root-crew', 'in-crew-open'])
    expect(ancestorChain(items, null)).toEqual([])
    expect(subtreeIds(items, 'root-open').sort()).toEqual(['in-open', 'in-open-crew', 'root-open'])
  })
})

describe('uploads', () => {
  it('accepts exact types and wildcards only', () => {
    const accept = ['application/pdf', 'image/*']
    expect(isAccepted('application/pdf', accept)).toBe(true)
    expect(isAccepted('image/png', accept)).toBe(true)
    expect(isAccepted('application/pdf; charset=binary', accept)).toBe(true)
    expect(isAccepted('text/html', accept)).toBe(false)
    expect(isAccepted('imagex/png', accept)).toBe(false)
  })

  it('sanitises file names', () => {
    expect(safeFilename('../Håndbog 2026.pdf')).toBe('_H_ndbog_2026.pdf')
    expect(safeFilename('.hidden')).toBe('hidden')
    expect(safeFilename('***')).toBe('_')
  })
})
