import { describe, expect, it } from 'vitest'
import {
  contentArticleId,
  contentBody,
  contentRowKey,
  frontmatterKeys,
  groupContentArticles,
  isContentArticleId,
  localizedContentCollection,
  missingContentLocales,
  parseContentArticleId,
  validateContentFile,
} from '../../src/runtime/utils/content'

describe('content article ids', () => {
  it('are content:<collection>:<path>', () => {
    expect(contentArticleId('help', 'safety/first-aid')).toBe('content:help:safety/first-aid')
    expect(isContentArticleId('content:help:x')).toBe(true)
    expect(isContentArticleId('hlp_abc')).toBe(false)
    expect(parseContentArticleId('content:help:safety/first-aid')).toEqual({ collection: 'help', path: 'safety/first-aid' })
    expect(parseContentArticleId('hlp_abc')).toBeNull()
  })

  it('give the same key to the same file in every language', () => {
    expect(contentRowKey({ stem: 'da/safety/first-aid' }, 'da')).toBe('safety/first-aid')
    expect(contentRowKey({ stem: 'en/safety/first-aid' }, 'en')).toBe('safety/first-aid')
    expect(contentRowKey({ path: '/safety/first-aid' })).toBe('safety/first-aid')
    expect(contentRowKey({ stem: 'safety/first-aid.md' })).toBe('safety/first-aid')
  })

  it('name the per-locale collections like the docs site does', () => {
    expect(localizedContentCollection('help', 'da')).toBe('help_da')
    expect(localizedContentCollection('help', 'pt-BR')).toBe('help_pt_BR')
  })
})

describe('the body of a file', () => {
  it('is the Markdown without the frontmatter block', () => {
    expect(contentBody({ rawbody: '---\ntitle: X\n---\n\nHello **world**.\n' })).toBe('Hello **world**.')
    expect(contentBody({ rawbody: 'No frontmatter.' })).toBe('No frontmatter.')
    expect(contentBody({})).toBe('')
  })

  it('lists the frontmatter keys, also the ones a collection schema would drop', () => {
    expect(frontmatterKeys('---\ntitle: X\ncategory: safety\nvisibility:\n  public: false\n---\nBody')).toEqual(['title', 'category', 'visibility'])
    expect(frontmatterKeys('Body only')).toEqual([])
  })
})

describe('grouping the files of a collection', () => {
  const row = (stem: string, locale: string | undefined, extra: Record<string, unknown> = {}) => ({
    stem,
    locale,
    title: `${stem} (${locale})`,
    category: 'safety',
    rawbody: `---\nx: 1\n---\nText in ${locale}`,
    ...extra,
  })

  it('makes one article per path with the title and text of every language', () => {
    const [article] = groupContentArticles([
      { row: row('en/safety/first-aid', 'en'), locale: 'en' },
      { row: row('da/safety/first-aid', 'da'), locale: 'da' },
    ], { collection: 'help', locales: ['da', 'en'] })
    expect(article).toMatchObject({
      key: 'safety/first-aid',
      id: 'content:help:safety/first-aid',
      slug: 'first-aid',
      categorySlug: 'safety',
      title: { da: 'da/safety/first-aid (da)', en: 'en/safety/first-aid (en)' },
      body: { da: 'Text in da', en: 'Text in en' },
    })
  })

  it('takes the slug, the category and the order from the frontmatter', () => {
    const [article] = groupContentArticles([
      { row: row('da/x', 'da', { slug: 'custom-slug', category: 'other', order: 4, checklist: ['hck_1', 'hck_2'] }), locale: 'da' },
    ], { collection: 'help', locales: ['da', 'en'] })
    expect(article).toMatchObject({ slug: 'custom-slug', categorySlug: 'other', order: 4, checklists: ['hck_1', 'hck_2'] })
  })

  it('reads the frontmatter keys Nuxt Content keeps in meta', () => {
    const [article] = groupContentArticles([
      { row: { stem: 'x', title: 'X', rawbody: 'Body', meta: { category: 'safety', order: 2, slug: 'from-meta' } }, locale: undefined },
    ], { collection: 'help', locales: ['da', 'en'] })
    expect(article).toMatchObject({ slug: 'from-meta', categorySlug: 'safety', order: 2 })
  })

  it('keeps a text without a language as one text for every language', () => {
    const [article] = groupContentArticles([{ row: row('x', undefined), locale: undefined }], { collection: 'help', locales: ['da', 'en'] })
    expect(article!.title).toBe('x (undefined)')
    expect(article!.body).toBe('Text in undefined')
  })

  it('skips files without a category or with an unusable slug, in order of `order` then path', () => {
    const articles = groupContentArticles([
      { row: row('b', 'da', { order: 2 }), locale: 'da' },
      { row: row('a', 'da', { order: 2 }), locale: 'da' },
      { row: row('c', 'da', { order: 1 }), locale: 'da' },
      { row: row('no-category', 'da', { category: undefined }), locale: 'da' },
      { row: row('Bad Slug', 'da'), locale: 'da' },
      { row: row('search', 'da'), locale: 'da' },
    ], { collection: 'help', locales: ['da', 'en'] })
    expect(articles.map(article => article.key)).toEqual(['c', 'a', 'b'])
  })
})

describe('the build-time rules of a file', () => {
  const ok = { keys: ['title', 'category', 'locale'], title: 'T', category: 'safety', locale: 'da' }

  it('accepts a file with a title, a category and a locale', () => {
    expect(validateContentFile(ok, { perLocale: false }).errors).toEqual([])
  })

  it('fails on visibility and public: content is always public', () => {
    const visibility = validateContentFile({ ...ok, keys: [...ok.keys, 'visibility'], id: 'help/da/x.md' }, { perLocale: false })
    expect(visibility.errors).toHaveLength(1)
    expect(visibility.errors[0]).toMatch(/sets `visibility`/)
    expect(visibility.errors[0]).toMatch(/always public/)
    expect(visibility.errors[0]).toMatch(/help\/da\/x\.md/)
    expect(validateContentFile({ ...ok, keys: [...ok.keys, 'public'] }, { perLocale: false }).errors[0]).toMatch(/sets `public`/)
    expect(validateContentFile({ ...ok, keys: [...ok.keys, 'public', 'visibility'] }, { perLocale: false }).errors).toHaveLength(2)
  })

  it('fails without a usable category, title or slug', () => {
    expect(validateContentFile({ ...ok, category: undefined }, { perLocale: false }).errors[0]).toMatch(/needs a `category`/)
    expect(validateContentFile({ ...ok, category: 'Not Valid' }, { perLocale: false }).errors[0]).toMatch(/unusable `category`/)
    expect(validateContentFile({ ...ok, title: '' }, { perLocale: false }).errors[0]).toMatch(/needs a `title`/)
    expect(validateContentFile({ ...ok, slug: 'search' }, { perLocale: false }).errors[0]).toMatch(/unusable `slug`/)
  })

  it('needs a locale when one collection holds every language, but not with a collection per language', () => {
    expect(validateContentFile({ ...ok, locale: undefined }, { perLocale: false }).errors[0]).toMatch(/needs a `locale`/)
    expect(validateContentFile({ ...ok, locale: undefined }, { perLocale: true }).errors).toEqual([])
  })
})

describe('missing languages', () => {
  it('lists the articles that lack a required language', () => {
    expect(missingContentLocales([
      { key: 'a', locale: 'da' },
      { key: 'a', locale: 'en' },
      { key: 'b', locale: 'da' },
      { key: 'c', locale: undefined },
    ], ['da', 'en'])).toEqual([
      { key: 'b', missing: ['en'] },
      { key: 'c', missing: ['da', 'en'] },
    ])
  })

  it('is empty when everything is translated', () => {
    expect(missingContentLocales([{ key: 'a', locale: 'da' }, { key: 'a', locale: 'en' }], ['da', 'en'])).toEqual([])
  })
})
