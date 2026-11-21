import { describe, expect, it } from 'vitest'
import { faqCardProps, faqPageJsonLd } from '../../src/runtime/utils'
import type { FaqGroupDto } from '../../src/runtime/utils'

const group = (overrides: Partial<FaqGroupDto> = {}): FaqGroupDto => ({
  id: 'faq_1',
  slug: 'membership',
  title: { da: 'Medlemskab', en: 'Membership' },
  description: { da: 'Om medlemskab', en: 'About membership' },
  icon: 'i-lucide-info',
  owner: { type: 'platform', id: null },
  sort: 0,
  public: true,
  items: [
    {
      id: 'fqi_1',
      groupId: 'faq_1',
      question: { da: 'Hvad koster det?', en: 'What does it cost?' },
      answer: { da: 'Intet.', en: 'Nothing.' },
      icon: 'i-lucide-coins',
      links: [{ label: 'Prices', to: '/prices', icon: 'i-lucide-tag' }],
      sort: 0,
      public: true,
    },
    {
      id: 'fqi_2',
      groupId: 'faq_1',
      question: 'Plain question?',
      answer: { en: 'Only English.' },
      icon: null,
      links: [],
      sort: 1,
      public: false,
    },
  ],
  ...overrides,
})

describe('toFaqCardProps (faqCardProps)', () => {
  it('maps a group to the props of FaqCard in the locale', () => {
    expect(faqCardProps(group(), 'da')).toEqual({
      title: 'Medlemskab',
      description: 'Om medlemskab',
      icon: 'i-lucide-info',
      faqs: [
        { title: 'Hvad koster det?', details: 'Intet.', icon: 'i-lucide-coins', as: 'fqi_1', links: [{ label: 'Prices', to: '/prices', icon: 'i-lucide-tag' }] },
        { title: 'Plain question?', details: 'Only English.', icon: undefined, as: 'fqi_2', links: undefined },
      ],
    })
  })

  it('falls back to the default locale, then English, so a half-translated item shows another language instead of nothing', () => {
    const card = faqCardProps(group(), 'sv', 'da')
    expect(card.title).toBe('Medlemskab')
    expect(card.faqs?.[1]?.details).toBe('Only English.')
    expect(faqCardProps(group(), 'sv').title).toBe('Membership')
  })

  it('leaves out an empty description and icon', () => {
    const card = faqCardProps(group({ description: null, icon: null }), 'en')
    expect(card.description).toBeUndefined()
    expect(card.icon).toBeUndefined()
  })

  it('gives each question the item id as its slot name, so a page can replace one answer', () => {
    expect(faqCardProps(group(), 'en').faqs?.map(faq => faq.as)).toEqual(['fqi_1', 'fqi_2'])
  })
})

describe('FAQPage JSON-LD', () => {
  it('lists the public items of public groups only', () => {
    const jsonLd = faqPageJsonLd([group(), group({ id: 'faq_2', public: false })], 'en')
    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': [{ '@type': 'Question', 'name': 'What does it cost?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Nothing.' } }],
    })
  })

  it('is null when nothing is public', () => {
    expect(faqPageJsonLd([group({ public: false })], 'en')).toBeNull()
    expect(faqPageJsonLd([], 'en')).toBeNull()
  })
})
