import { describe, expect, it } from 'vitest'
import { mergeBySlug, orderSourceIds } from '../../src/runtime/utils/merge'

describe('merging sources', () => {
  it('lets the first source win a clash of slugs', () => {
    const database = [{ slug: 'a', from: 'database' }, { slug: 'b', from: 'database' }]
    const content = [{ slug: 'b', from: 'content' }, { slug: 'c', from: 'content' }]
    expect(mergeBySlug([database, content])).toEqual([
      { slug: 'a', from: 'database' },
      { slug: 'b', from: 'database' },
      { slug: 'c', from: 'content' },
    ])
    expect(mergeBySlug([content, database])).toEqual([
      { slug: 'b', from: 'content' },
      { slug: 'c', from: 'content' },
      { slug: 'a', from: 'database' },
    ])
  })

  it('follows the precedence: the named source goes first, the rest keep their order', () => {
    expect(orderSourceIds(['database', 'content'], 'database')).toEqual(['database', 'content'])
    expect(orderSourceIds(['database', 'content'], 'content')).toEqual(['content', 'database'])
    expect(orderSourceIds(['database', 'wiki', 'content'], 'content')).toEqual(['content', 'database', 'wiki'])
    // A precedence that is not listed changes nothing.
    expect(orderSourceIds(['database', 'wiki'], 'content')).toEqual(['database', 'wiki'])
  })

  it('merges by precedence end to end', () => {
    const lists: Record<string, Array<{ slug: string, from: string }>> = {
      database: [{ slug: 'shared', from: 'database' }],
      content: [{ slug: 'shared', from: 'content' }, { slug: 'only-content', from: 'content' }],
    }
    const merged = (precedence: string) => mergeBySlug(orderSourceIds(['database', 'content'], precedence).map(id => lists[id]!))
    expect(merged('database').find(entry => entry.slug === 'shared')?.from).toBe('database')
    expect(merged('content').find(entry => entry.slug === 'shared')?.from).toBe('content')
    expect(merged('content').map(entry => entry.slug).sort()).toEqual(['only-content', 'shared'])
  })
})
