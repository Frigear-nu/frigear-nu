import { describe, expect, it } from 'vitest'
import { D1_PARAM_CHUNK, chunkParams, inChunks } from '../src/runtime/server'

describe('chunkParams', () => {
  it('cuts a list into chunks under D1\'s 100 bound parameters', () => {
    expect(D1_PARAM_CHUNK).toBeLessThan(100)
    const chunks = chunkParams(Array.from({ length: 200 }, (_value, index) => index))
    expect(chunks.map(chunk => chunk.length)).toEqual([90, 90, 20])
    expect(chunks.flat()).toEqual(Array.from({ length: 200 }, (_value, index) => index))
  })

  it('takes a size, never below 1', () => {
    expect(chunkParams([1, 2, 3], 2)).toEqual([[1, 2], [3]])
    expect(chunkParams([1, 2], 0)).toEqual([[1], [2]])
    expect(chunkParams([1, 2], 1.7)).toEqual([[1], [2]])
  })

  it('gives no chunks for an empty list', () => {
    expect(chunkParams([])).toEqual([])
  })
})

describe('inChunks', () => {
  it('runs one query per chunk and joins the rows in order', async () => {
    const calls: number[][] = []
    const rows = await inChunks([1, 2, 3, 4, 5], async (chunk) => {
      calls.push(chunk)
      return chunk.map(value => value * 10)
    }, 2)
    expect(calls).toEqual([[1, 2], [3, 4], [5]])
    expect(rows).toEqual([10, 20, 30, 40, 50])
  })

  it('runs no query for an empty list', async () => {
    let ran = false
    expect(await inChunks([], async () => {
      ran = true
      return []
    })).toEqual([])
    expect(ran).toBe(false)
  })
})
