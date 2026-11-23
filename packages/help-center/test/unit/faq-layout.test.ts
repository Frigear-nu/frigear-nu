import { describe, expect, it } from 'vitest'
import { faqSectionListExpected, faqSectionListLayout } from '../../src/runtime/app/utils/faq-layout'

describe('faqSectionListLayout', () => {
  it('shows one card as the section itself: reading width in the middle, no card frame', () => {
    expect(faqSectionListLayout(1)).toEqual({
      list: 'mx-auto w-full max-w-3xl',
      card: { variant: 'naked', spotlight: false },
    })
    // Nothing yet (or nothing found) lays out like one, so a skeleton does not jump.
    expect(faqSectionListLayout(0)).toEqual(faqSectionListLayout(1))
  })

  it('fills the width with a grid for several cards, and keeps their own card look', () => {
    expect(faqSectionListLayout(2)).toEqual({ list: 'grid items-start gap-6 @2xl:grid-cols-2', card: {} })
    expect(faqSectionListLayout(3).list).toBe('grid items-start gap-6 @2xl:grid-cols-2 @5xl:grid-cols-3')
    expect(faqSectionListLayout(7).list).toBe(faqSectionListLayout(3).list)
  })
})

describe('faqSectionListExpected', () => {
  it('counts the categories (an array or what MDC passes) and the inline items', () => {
    expect(faqSectionListExpected({ categories: 'board' })).toBe(1)
    expect(faqSectionListExpected({ categories: 'board, funding,' })).toBe(2)
    expect(faqSectionListExpected({ categories: ['a', 'b', 'c'], items: [{}] })).toBe(4)
    expect(faqSectionListExpected({})).toBe(0)
  })
})
