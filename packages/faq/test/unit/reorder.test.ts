import { describe, expect, it } from 'vitest'
import { checkReorder, isValidReorder, moveId } from '../../src/runtime/utils'

describe('reorder validation', () => {
  const current = ['a', 'b', 'c']

  it('accepts any permutation of exactly the group\'s ids', () => {
    expect(isValidReorder(checkReorder(current, ['c', 'a', 'b']))).toBe(true)
    expect(isValidReorder(checkReorder(current, ['a', 'b', 'c']))).toBe(true)
    expect(isValidReorder(checkReorder([], []))).toBe(true)
  })

  it('refuses an order that leaves an item out', () => {
    expect(checkReorder(current, ['a', 'b'])).toEqual({ missing: ['c'], unknown: [], duplicates: [] })
  })

  it('refuses an id that is not an item of the group (an item of another group)', () => {
    expect(checkReorder(current, ['a', 'b', 'c', 'z'])).toEqual({ missing: [], unknown: ['z'], duplicates: [] })
    expect(checkReorder(current, ['a', 'b', 'z'])).toEqual({ missing: ['c'], unknown: ['z'], duplicates: [] })
  })

  it('refuses an id listed twice', () => {
    const problems = checkReorder(current, ['a', 'a', 'b', 'c'])
    expect(problems.duplicates).toEqual(['a'])
    expect(isValidReorder(problems)).toBe(false)
  })
})

describe('moveId', () => {
  it('moves an id to a new position in a copy', () => {
    const ids = ['a', 'b', 'c', 'd']
    expect(moveId(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveId(ids, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves the order alone for a move that goes nowhere', () => {
    expect(moveId(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
    expect(moveId(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveId(['a', 'b'], 0, 2)).toEqual(['a', 'b'])
  })
})
