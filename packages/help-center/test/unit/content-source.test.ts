import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { createContentSource } from '../../src/runtime/server/content-source'
import type { HelpContentRow } from '../../src/runtime/utils/content'

// `queryCollection` of Nuxt Content is stubbed: the source reads rows through the `query` it is given. The real one is
// `queryCollection(event, name).all()` (`server/utils/help-center-content.ts`); a fixture with `@nuxt/content` would only
// test Nuxt Content's own database.
const event = {} as H3Event
const reader = (user: { id: number } | null) => ({ user, canRead: async () => false })
const ctx = { event, reader: reader(null), requiredLocales: ['da', 'en'] }

const rows: Record<string, HelpContentRow[]> = {
  help: [
    { stem: 'da/safety/first-aid', locale: 'da', title: 'Førstehjælp', category: 'safety', order: 2, rawbody: '---\nx: 1\n---\nRing 112.' },
    { stem: 'en/safety/first-aid', locale: 'en', title: 'First aid', category: 'safety', order: 2, rawbody: '---\nx: 1\n---\nCall 112.' },
    { stem: 'da/safety/fire', locale: 'da', title: 'Brand', category: 'safety', order: 1, rawbody: 'Find slukkeren.' },
    { stem: 'en/safety/fire', locale: 'en', title: 'Fire', category: 'safety', order: 1, rawbody: 'Find the extinguisher.' },
    { stem: 'da/parking', locale: 'da', title: 'Parkering', category: 'getting-there', rawbody: 'Ved porten.' },
  ],
  help_da: [{ stem: 'da/guide', title: 'Guide', category: 'basics', rawbody: 'Dansk' }],
  help_en: [{ stem: 'en/guide', title: 'Guide', category: 'basics', rawbody: 'English' }],
}

const source = (perLocale = false, collection = 'help') => createContentSource({
  collection,
  perLocale,
  locales: ['da', 'en'],
  query: async (_event, name) => {
    if (!rows[name]) throw new Error(`no collection ${name}`)
    return rows[name]
  },
})

describe('the content source', () => {
  it('is read-only and called content', () => {
    expect(source()).toMatchObject({ id: 'content', readOnly: true })
  })

  it('lists articles with every language, in order, always public', async () => {
    const list = await source().list(ctx)
    expect(list.map(article => article.slug)).toEqual(['parking', 'fire', 'first-aid'])
    const fire = list.find(article => article.slug === 'fire')!
    expect(fire).toMatchObject({
      id: 'content:help:safety/fire',
      source: 'content',
      public: true,
      categorySlug: 'safety',
      title: { da: 'Brand', en: 'Fire' },
      body: { da: 'Find slukkeren.', en: 'Find the extinguisher.' },
    })
  })

  it('serves public articles to anonymous visitors and signed-in readers alike: nothing restricts content', async () => {
    const anonymous = await source().list(ctx)
    const member = await source().list({ ...ctx, reader: reader({ id: 1 }) })
    expect(member).toEqual(anonymous)
    expect(anonymous.every(article => article.public)).toBe(true)
  })

  it('filters by category and searches title and text in any language', async () => {
    expect((await source().list({ ...ctx, category: 'safety' })).map(article => article.slug)).toEqual(['fire', 'first-aid'])
    expect((await source().list({ ...ctx, q: 'extinguisher' })).map(article => article.slug)).toEqual(['fire'])
    expect((await source().list({ ...ctx, q: 'SLUKKEREN' })).map(article => article.slug)).toEqual(['fire'])
    expect(await source().list({ ...ctx, q: 'nothing like this' })).toEqual([])
  })

  it('gets an article by slug and by id, and not by a database id', async () => {
    const content = source()
    expect((await content.get('first-aid', ctx))?.id).toBe('content:help:safety/first-aid')
    expect(await content.get('nope', ctx)).toBeUndefined()
    expect((await content.getById!('content:help:safety/fire', ctx))?.slug).toBe('fire')
    expect(await content.getById!('hlp_123', ctx)).toBeUndefined()
  })

  it('derives categories from the articles: public, titled after the slug', async () => {
    const categories = await source().categories(ctx)
    // In the order of the first article of each: parking (no order), then fire and first aid.
    expect(categories.map(category => category.slug)).toEqual(['getting-there', 'safety'])
    expect(categories.every(category => category.visible && category.public && category.source === 'content')).toBe(true)
    expect(categories.find(category => category.slug === 'getting-there')?.name).toBe('Getting there')
  })

  it('reads one collection per language when asked, and skips one that does not exist', async () => {
    const articles = await source(true).articles(event)
    expect(articles).toHaveLength(1)
    expect(articles[0]).toMatchObject({ key: 'guide', id: 'content:help:guide', title: { da: 'Guide', en: 'Guide' }, body: { da: 'Dansk', en: 'English' } })
    const failures: string[] = []
    const failing = createContentSource({
      collection: 'missing',
      perLocale: true,
      locales: ['da', 'en'],
      query: async () => {
        throw new Error('none')
      },
      onError: collection => failures.push(collection),
    })
    expect(await failing.articles({} as H3Event)).toEqual([])
    // Skipped, but reported: a language without a collection is never silent.
    expect(failures).toEqual(['missing_da', 'missing_en'])
  })

  it('reads each collection once per request', async () => {
    let reads = 0
    const counting = createContentSource({ collection: 'help', perLocale: false, locales: ['da', 'en'], query: async () => (reads++, rows.help!) })
    const request = {} as H3Event
    await counting.list({ ...ctx, event: request })
    await counting.get('fire', { ...ctx, event: request })
    await counting.getById!('content:help:safety/fire', { ...ctx, event: request })
    await counting.categories({ ...ctx, event: request })
    expect(reads).toBe(1)
    await counting.list({ ...ctx, event: {} as H3Event })
    expect(reads).toBe(2)
  })
})
