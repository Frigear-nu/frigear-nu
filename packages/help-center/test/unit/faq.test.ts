import { describe, expect, it } from 'vitest'
import { checkReorder, faqCardProps, faqPageFromQuestions, faqPageJsonLd, helpDisplayForKind, helpDisplaysForKind, isHelpDisplayForKind, isValidReorder, moveId } from '../../src/runtime/utils'
import type { HelpArticleDto, HelpFaqDto } from '../../src/runtime/utils'

const article = (overrides: Partial<HelpArticleDto> = {}): HelpArticleDto => ({
  id: 'hlp_1',
  slug: 'cost',
  title: { da: 'Hvad koster det?', en: 'What does it cost?' },
  body: { da: 'Intet.', en: 'Nothing.' },
  categorySlug: 'membership',
  source: 'database',
  public: true,
  icon: 'i-lucide-coins',
  links: [{ label: 'Prices', to: '/prices', icon: 'i-lucide-tag' }],
  sort: 0,
  publishedAt: null,
  updatedAt: null,
  ...overrides,
})

const faq = (overrides: Partial<HelpFaqDto> = {}): HelpFaqDto => ({
  id: 'hlc_1',
  slug: 'membership',
  name: { da: 'Medlemskab', en: 'Membership' },
  description: { da: 'Om medlemskab', en: 'About membership' },
  parentId: null,
  sort: 0,
  public: true,
  source: 'database',
  display: 'accordion',
  icon: 'i-lucide-info',
  articles: [
    article(),
    article({ id: 'hlp_2', slug: 'plain', title: 'Plain question?', body: { en: 'Only English.' }, icon: null, links: [], sort: 1, public: false }),
  ],
  ...overrides,
})

describe('toFaqCardProps (faqCardProps)', () => {
  it('maps an accordion category to the props of FaqCard in the locale', () => {
    expect(faqCardProps(faq(), 'da')).toEqual({
      title: 'Medlemskab',
      description: 'Om medlemskab',
      icon: 'i-lucide-info',
      faqs: [
        { title: 'Hvad koster det?', details: 'Intet.', icon: 'i-lucide-coins', as: 'hlp_1', links: [{ label: 'Prices', to: '/prices', icon: 'i-lucide-tag' }] },
        { title: 'Plain question?', details: 'Only English.', icon: undefined, as: 'hlp_2', links: undefined },
      ],
    })
  })

  it('falls back to the default locale, then English, so a half-translated article shows another language instead of nothing', () => {
    const card = faqCardProps(faq(), 'sv', 'da')
    expect(card.title).toBe('Medlemskab')
    expect(card.faqs?.[1]?.details).toBe('Only English.')
    expect(faqCardProps(faq(), 'sv').title).toBe('Membership')
  })

  it('leaves out an empty description and icon', () => {
    const card = faqCardProps(faq({ description: null, icon: null }), 'en')
    expect(card.description).toBeUndefined()
    expect(card.icon).toBeUndefined()
  })
})

describe('FAQPage JSON-LD', () => {
  it('lists the public articles of public categories only', () => {
    expect(faqPageJsonLd([faq(), faq({ id: 'hlc_2', public: false })], 'en')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': [{ '@type': 'Question', 'name': 'What does it cost?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Nothing.' } }],
    })
  })

  it('is null when nothing is public', () => {
    expect(faqPageJsonLd([faq({ public: false })], 'en')).toBeNull()
    expect(faqPageJsonLd([], 'en')).toBeNull()
  })

  it('puts plain text in the answers', () => {
    const jsonLd = faqPageJsonLd([faq({ articles: [article({ body: { da: '**Intet.**', en: 'Nothing, see [prices](/prices).' } })] })], 'en') as { mainEntity: Array<{ acceptedAnswer: { text: string } }> }
    expect(jsonLd.mainEntity[0]!.acceptedAnswer.text).toBe('Nothing, see prices.')
  })

  it('lists a question once, however many components contributed it', () => {
    const entity = { '@type': 'Question', 'name': 'Q?' }
    const page = faqPageFromQuestions([{ id: 'hlp_1', entity }, { id: 'hlp_2', entity: { ...entity, name: 'R?' } }, { id: 'hlp_1', entity }]) as { mainEntity: unknown[] }
    expect(page.mainEntity).toHaveLength(2)
    expect(faqPageFromQuestions([])).toBeNull()
  })
})

describe('reorder validation', () => {
  const current = ['a', 'b', 'c']

  it('accepts any permutation of exactly the category\'s ids', () => {
    expect(isValidReorder(checkReorder(current, ['c', 'a', 'b']))).toBe(true)
    expect(isValidReorder(checkReorder([], []))).toBe(true)
  })

  it('refuses an order that leaves an article out, adds another one or lists one twice', () => {
    expect(checkReorder(current, ['a', 'b'])).toEqual({ missing: ['c'], unknown: [], duplicates: [] })
    expect(checkReorder(current, ['a', 'b', 'z'])).toEqual({ missing: ['c'], unknown: ['z'], duplicates: [] })
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

describe('displays per kind', () => {
  it('offers cards or questions for an FAQ, a list or questions for a help category, the default first', () => {
    expect(helpDisplaysForKind('faq')).toEqual(['cards', 'accordion'])
    expect(helpDisplaysForKind('help')).toEqual(['list', 'accordion'])
    expect(isHelpDisplayForKind('faq', 'list')).toBe(false)
    expect(isHelpDisplayForKind('help', 'cards')).toBe(false)
    expect(isHelpDisplayForKind('help', 'accordion')).toBe(true)
    expect(isHelpDisplayForKind('faq', undefined)).toBe(false)
  })

  it('resets a display the new kind does not offer to its first', () => {
    expect(helpDisplayForKind('faq', 'list')).toBe('cards')
    expect(helpDisplayForKind('help', 'cards')).toBe('list')
    expect(helpDisplayForKind('faq', 'accordion')).toBe('accordion')
  })
})
