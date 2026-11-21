// The Nuxt Content article source. It takes the way of reading a collection as an argument (`query`), so the code that
// turns files into articles is testable without a Nuxt Content database; `server/utils/help-center-content.ts` wires the
// real `queryCollection`. Content articles are always public: Nuxt Content serves every collection to the browser.
import type { H3Event } from 'h3'
import type { HelpArticleDto, HelpCenterSource, HelpSourceCategory, HelpSourceContext } from '../../types'
import { groupContentArticles, isContentArticleId, localizedContentCollection } from '../utils/content'
import type { HelpContentArticle, HelpContentRow } from '../utils/content'

export type ContentQuery = (event: H3Event, collection: string) => Promise<HelpContentRow[]>

export type ContentSourceOptions = {
  /** The collection (`help`), or the prefix of the per-locale ones (`help_da`, `help_en`). */
  collection: string
  perLocale: boolean
  /** The languages to read: the required locales. */
  locales: readonly string[]
  query: ContentQuery
  /** Called when one per-locale collection cannot be read (it is skipped). Defaults to a warning in the log. */
  onError?: (collection: string, error: unknown) => void
}

// Each collection is read once per request: a send or a checklist asks for the articles again and again. Keyed by the
// request event, so nothing outlives the request.
const requestReads = new WeakMap<object, Map<string, Promise<HelpContentArticle[]>>>()

const humanize = (slug: string) => slug.replace(/-+/g, ' ').replace(/^./, char => char.toUpperCase())

/** The text a search matches: the title and body in every language, lowercased. */
const haystack = (article: HelpContentArticle) => {
  const parts = (value: HelpContentArticle['title']) => typeof value === 'string' ? [value] : Object.values(value)
  return [...parts(article.title), ...parts(article.body)].join('\n').toLocaleLowerCase()
}

export const contentArticleDto = (article: HelpContentArticle): HelpArticleDto => ({
  id: article.id,
  slug: article.slug,
  title: article.title,
  body: article.body,
  categorySlug: article.categorySlug,
  source: 'content',
  public: true,
  sort: article.order,
  publishedAt: null,
  updatedAt: null,
})

export function createContentSource(options: ContentSourceOptions): HelpCenterSource & { articles: (event: H3Event) => Promise<HelpContentArticle[]> } {
  /** Every article of the collection with its languages. A missing per-locale collection is skipped. */
  function articles(event: H3Event): Promise<HelpContentArticle[]> {
    const reads = requestReads.get(event) ?? new Map<string, Promise<HelpContentArticle[]>>()
    requestReads.set(event, reads)
    const key = `${options.collection}|${options.perLocale}|${options.locales.join(',')}`
    let read = reads.get(key)
    if (!read) reads.set(key, read = readArticles(event))
    return read
  }

  async function readArticles(event: H3Event): Promise<HelpContentArticle[]> {
    const entries: Array<{ row: HelpContentRow, locale: string | undefined }> = []
    if (options.perLocale) {
      for (const locale of options.locales) {
        const name = localizedContentCollection(options.collection, locale)
        const rows = await options.query(event, name).catch((error: unknown) => {
          // A language without a collection is skipped, but never silently.
          (options.onError ?? ((collection, cause) => console.warn(`[@frigear-nu/help-center] could not read the content collection "${collection}":`, cause)))(name, error)
          return [] as HelpContentRow[]
        })
        for (const row of rows) entries.push({ row, locale })
      }
    }
    else {
      for (const row of await options.query(event, options.collection)) {
        const locale = row.locale ?? row.meta?.locale
        entries.push({ row, locale: typeof locale === 'string' && locale ? locale : undefined })
      }
    }
    return groupContentArticles(entries, { collection: options.collection, locales: options.locales })
  }

  const find = async (ctx: HelpSourceContext, match: (article: HelpContentArticle) => boolean) => {
    const article = (await articles(ctx.event)).find(match)
    return article ? contentArticleDto(article) : undefined
  }

  return {
    id: 'content',
    readOnly: true,
    articles,
    async list(ctx) {
      const needle = ctx.q?.trim().toLocaleLowerCase()
      return (await articles(ctx.event))
        .filter(article => !ctx.category || article.categorySlug === ctx.category)
        .filter(article => !needle || haystack(article).includes(needle))
        .map(contentArticleDto)
    },
    get: (slug, ctx) => find(ctx, article => article.slug === slug),
    getById: (id, ctx) => isContentArticleId(id) ? find(ctx, article => article.id === id) : undefined,
    async categories(ctx): Promise<HelpSourceCategory[]> {
      const slugs = [...new Set((await articles(ctx.event)).map(article => article.categorySlug))]
      // A category of Nuxt Content has no file of its own: it exists because an article names it, titled after its slug.
      // A database category with the same slug replaces it, and carries its title, grants and FAQ groups.
      return slugs.map(slug => ({
        id: `content-category:${slug}`,
        slug,
        name: humanize(slug),
        description: null,
        parentId: null,
        sort: 1000,
        public: true,
        source: 'content',
        faqGroups: [],
        visible: true,
      }))
    },
  }
}
