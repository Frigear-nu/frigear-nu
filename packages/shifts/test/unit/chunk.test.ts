import { describe, expect, it } from 'vitest'
import { SHIFTS_ID_CHUNK, shiftsChunk } from '../../src/runtime/utils/chunk'

describe('id chunks (the 100 bound parameter limit of D1)', () => {
  it('splits a list into chunks of at most the size, keeping order', () => {
    const ids = Array.from({ length: 205 }, (_value, index) => index)
    const chunks = shiftsChunk(ids, 90)
    expect(chunks.map(part => part.length)).toEqual([90, 90, 25])
    expect(chunks.flat()).toEqual(ids)
  })

  it('has no chunks for nothing, one for a few, and defaults below 100', () => {
    expect(shiftsChunk([])).toEqual([])
    expect(shiftsChunk([1, 2, 3])).toEqual([[1, 2, 3]])
    expect(SHIFTS_ID_CHUNK).toBeLessThan(100)
    expect(shiftsChunk(Array.from({ length: 101 }, (_value, index) => index)).every(part => part.length <= SHIFTS_ID_CHUNK)).toBe(true)
    // A silly size still makes progress.
    expect(shiftsChunk([1, 2], 0)).toEqual([[1], [2]])
  })
})
