import { parseMarkdown, stringifyMarkdown } from '@nuxtjs/mdc/runtime'
import { describe, expect, it } from 'vitest'
import { articleCardProps, faqBodyPartsOf, faqCardsProps, faqPageJsonLd, splitFaqBody, stripMarkdown } from '../../src/runtime/utils'
import type { FaqMarkdownParser, FaqMarkdownStringifier, HelpArticleDto, HelpFaqDto } from '../../src/runtime/utils'

const parse = parseMarkdown as unknown as FaqMarkdownParser
const stringify = stringifyMarkdown as unknown as FaqMarkdownStringifier
const split = (body: string) => splitFaqBody(body, parse, stringify)

const article = (overrides: Partial<HelpArticleDto> = {}): HelpArticleDto => ({
  id: 'hlp_1',
  slug: 'funding-membership',
  title: { da: 'Er det en fordel at være medlem?', en: 'Is it an advantage to be a member?' },
  body: { da: 'Nej.', en: 'No.' },
  categorySlug: 'funding',
  source: 'database',
  public: true,
  icon: 'i-lucide-user-check',
  links: [],
  sort: 0,
  publishedAt: null,
  updatedAt: null,
  ...overrides,
})

const faq = (overrides: Partial<HelpFaqDto> = {}): HelpFaqDto => ({
  id: 'hlc_1',
  slug: 'funding',
  name: { da: 'Projektansøgning', en: 'Project application' },
  description: null,
  parentId: null,
  sort: 0,
  public: true,
  source: 'database',
  display: 'cards',
  icon: null,
  articles: [article()],
  ...overrides,
})

describe('splitFaqBody', () => {
  it('reads a body without blocks as the description (the board cards)', async () => {
    expect(await split('100% frivillig bestyrelse.')).toEqual({ description: '100% frivillig bestyrelse.', details: [], links: [] })
  })

  it('turns a faq-details block into a question with one line per list item, keeping the marks', async () => {
    const parts = await split([
      'Ansøgning → Generalforsamling → Gennemgang → Svar → evt. udbetaling.',
      '',
      '::faq-details{label="Mere om processen..." icon="i-lucide-check-circle"}',
      '- ✅ Ansøgning indsendt senest **10 dage** før generalforsamling.',
      '- Vi forbeholder os retten :br (*Jf. gældende lovgivning*). :br :br',
      '- ❌ Se [vedtægterne](/vedtaegter) og \'#hashtags m.v.',
      '::',
    ].join('\n'))
    expect(parts.description).toBe('Ansøgning → Generalforsamling → Gennemgang → Svar → evt. udbetaling.')
    expect(parts.details).toEqual([{
      label: 'Mere om processen...',
      icon: 'i-lucide-check-circle',
      lines: [
        '✅ Ansøgning indsendt senest **10 dage** før generalforsamling.',
        'Vi forbeholder os retten :br (*Jf. gældende lovgivning*). :br :br',
        '❌ Se [vedtægterne](/vedtaegter) og \'#hashtags m.v.',
      ],
    }])
    expect(parts.links).toEqual([])
  })

  it('keeps a Markdown list as the description, continuation lines included (the closed-group card)', async () => {
    const parts = await split([
      '- ❌ **Nej**. :br',
      '    Frigear støtter udelukkende åbne projekter.',
      '',
      '::faq-details{label="Se mere om eksklution..." icon="i-lucide-x-circle"}',
      '- Udover lovmæssige forhold. :br :br Vi støtter udelukkende åbne projekter.',
      '::',
    ].join('\n'))
    expect(parts.description).toBe('- ❌ **Nej**. :br\n  Frigear støtter udelukkende åbne projekter.')
    expect(parts.details[0]).toEqual({ label: 'Se mere om eksklution...', icon: 'i-lucide-x-circle', lines: ['Udover lovmæssige forhold. :br :br Vi støtter udelukkende åbne projekter.'] })
  })

  it('turns a faq-link block into a button with its props (the membership card: a link only)', async () => {
    const parts = await split([
      '- ❌ **Nej**, alle ansøgninger behandles lige.',
      '- ✅ **Ja** — medlemskab giver en stemme på generalforsamlingen.',
      '',
      '::faq-link{label="Hop hen og bliv medlem" to="/membership" icon="i-lucide-user-plus" trailing-icon="i-lucide-arrow-right" variant="subtle" size="lg"}',
      '::',
    ].join('\n'))
    expect(parts.description).toBe('- ❌ **Nej**, alle ansøgninger behandles lige.\n- ✅ **Ja** — medlemskab giver en stemme på generalforsamlingen.')
    expect(parts.details).toEqual([])
    expect(parts.links).toEqual([{ label: 'Hop hen og bliv medlem', to: '/membership', icon: 'i-lucide-user-plus', trailingIcon: 'i-lucide-arrow-right', variant: 'subtle', size: 'lg' }])
  })

  it('reads details and a link in order (the crediting card)', async () => {
    const parts = await split([
      '✅ **Ja**. Vi mener det må være minimum.',
      '',
      '::faq-details{label="Se mere om tilkendegivelse..." icon="i-lucide-check-circle"}',
      '- Vi er stolte over vores **frivilliges indsats**.',
      '::',
      '',
      '::faq-link{label="Promo materiale og brandkit" to="/branding" icon="i-lucide-qr-code" trailing-icon="i-lucide-arrow-right" variant="subtle"}',
      '::',
    ].join('\n'))
    expect(parts.description).toBe('✅ **Ja**. Vi mener det må være minimum.')
    expect(parts.details).toHaveLength(1)
    expect(parts.links).toEqual([{ label: 'Promo materiale og brandkit', to: '/branding', icon: 'i-lucide-qr-code', trailingIcon: 'i-lucide-arrow-right', variant: 'subtle' }])
  })

  it('reads a faq-contact block with its initial values', async () => {
    const parts = await split([
      'Klager kan sendes til bestyrelsen via knappen herunder.',
      '',
      '::faq-contact{label="Kontakt bestyrelsen for at klage" :initial=\'{"subject":"complaint"}\'}',
      '::',
    ].join('\n'))
    expect(parts.contact).toEqual({ label: 'Kontakt bestyrelsen for at klage', initial: { subject: 'complaint' } })
    expect(parts.description).toBe('Klager kan sendes til bestyrelsen via knappen herunder.')
  })

  it('keeps the whole text as the description without a parser (no MDC in the app)', async () => {
    expect(await splitFaqBody('Text\n\n::faq-details{label="x"}\n- a\n::')).toEqual({ description: 'Text\n\n::faq-details{label="x"}\n- a\n::', details: [], links: [] })
  })
})

describe('cards categories', () => {
  it('maps every article of a cards category to a card of its own, in the locale', async () => {
    const body = { da: 'Nej.\n\n::faq-link{label="Bliv medlem" to="/membership"}\n::', en: 'No.\n\n::faq-link{label="Become a member" to="/en/membership"}\n::' }
    const category = faq({ articles: [article({ body }), article({ id: 'hlp_2', slug: 'b', title: { da: 'B', en: 'B' }, body: { da: 'Bare tekst.', en: 'Just text.' }, icon: null })] })
    const parts = await faqBodyPartsOf([category, faq({ slug: 'other', display: 'accordion' })], parse, stringify)
    expect(Object.keys(parts)).toHaveLength(4)
    expect(faqCardsProps(category, 'en', undefined, parts)).toEqual([
      { title: 'Is it an advantage to be a member?', description: 'No.', icon: 'i-lucide-user-check', faqs: [], links: [{ label: 'Become a member', to: '/en/membership' }] },
      { title: 'B', description: 'Just text.', icon: undefined, faqs: [] },
    ])
  })

  it('maps an accordion category to one card, and adds the article links after those of the text', async () => {
    expect(faqCardsProps(faq({ display: 'accordion' }), 'en')).toHaveLength(1)
    const card = articleCardProps(article({ links: [{ label: 'Prices', to: '/prices' }] }), 'en')
    expect(card.links).toEqual([{ label: 'Prices', to: '/prices' }])
    expect(card.description).toBe('No.')
  })

  it('has no parts without a parser', async () => {
    expect(await faqBodyPartsOf([faq()])).toEqual({})
  })
})

describe('FAQ JSON-LD of MDC text', () => {
  it('drops block fences and inline components such as :br', () => {
    const text = stripMarkdown([
      'Intro.',
      '',
      '::faq-details{label="Mere..." icon="i-lucide-check-circle"}',
      '- ✅ First. :br :br Second.',
      '::',
      '',
      '::faq-contact{label="Kontakt" :initial=\'{"subject":"complaint"}\'}',
      '::',
    ].join('\n'))
    expect(text).toBe('Intro. ✅ First. Second.')
    expect(stripMarkdown('Kl. 10:30 og :badge[Ny] her')).toBe('Kl. 10:30 og Ny her')
  })

  it('lists the articles of a cards category as questions', () => {
    const page = faqPageJsonLd([faq({ articles: [article({ body: { da: 'Nej. :br Aldrig.', en: 'No. :br Never.' } })] })], 'en')
    expect(page?.mainEntity).toEqual([{ '@type': 'Question', 'name': 'Is it an advantage to be a member?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'No. Never.' } }])
  })
})
