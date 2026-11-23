import { describe, expect, it } from 'vitest'
import { pageFaqSlugs, pageFaqsFound, showPageFaqs } from '../app/utils/page-faqs'

describe('pageFaqSlugs', () => {
  it('reads a page\'s category slugs from the config, as a list or a comma separated string', () => {
    expect(pageFaqSlugs({ board: ['board', ' board ', 'volunteering'] }, 'board')).toEqual(['board', 'volunteering'])
    expect(pageFaqSlugs({ funding: 'funding, money,' }, 'funding')).toEqual(['funding', 'money'])
    expect(pageFaqSlugs({ board: ['board'] }, 'funding')).toEqual([])
    expect(pageFaqSlugs(undefined, 'board')).toEqual([])
    expect(pageFaqSlugs({ board: null }, 'board')).toEqual([])
  })
})

describe('showPageFaqs', () => {
  const slugs = ['board']

  it('shows the section while it loads and once a category is found', () => {
    expect(showPageFaqs({ slugs, status: 'pending', found: 0 })).toBe(true)
    expect(showPageFaqs({ slugs, status: 'idle', found: 0 })).toBe(true)
    expect(showPageFaqs({ slugs, status: 'success', found: 1 })).toBe(true)
  })

  it('hides it when the categories are missing, the request fails or the page names none', () => {
    expect(showPageFaqs({ slugs, status: 'success', found: 0 })).toBe(false)
    expect(showPageFaqs({ slugs, status: 'error', found: 0 })).toBe(false)
    expect(showPageFaqs({ slugs: [], status: 'success', found: 0 })).toBe(false)
  })
})

describe('pageFaqsFound', () => {
  it('counts only the categories with published articles', () => {
    const article = { id: 'hca_1' }
    expect(pageFaqsFound([{ articles: [article] }, { articles: [] }])).toBe(1)
    // A category staff made but published nothing in yet: the section stays hidden.
    expect(showPageFaqs({ slugs: ['board'], status: 'success', found: pageFaqsFound([{ articles: [] }]) })).toBe(false)
    expect(pageFaqsFound([{ articles: [article, article] }, { articles: [article] }])).toBe(2)
    expect(pageFaqsFound([])).toBe(0)
    expect(pageFaqsFound(undefined)).toBe(0)
  })
})
