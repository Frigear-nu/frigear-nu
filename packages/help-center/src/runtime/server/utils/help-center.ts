import type { H3Event } from 'h3'
import { hasPublicGrant } from '@frigear-nu/auth/grants'
import { helpCenterAccess } from '../../access'
import type { HelpArticleDetailDto, HelpArticleDto, HelpArticleSummaryDto, HelpCategoryDto, HelpCenterSource, HelpFaqDto, HelpReader, HelpSourceCategory, HelpSourceContext, PublicModuleOptions } from '../../../types'
import { helpCenterContentSource } from './help-center-content'
import { helpCenterDatabaseSource, helpCenterRequiredLocales } from './help-center-db'
import { toHelpArticleSummary } from './help-center-dto'
import { mergeBySlug, orderSourceIds } from '../../utils/merge'

// --- Sources ---------------------------------------------------------------------------------

const registry = new Map<string, HelpCenterSource>()
const warned = new Set<string>()

/**
 * Registers an article source (see `defineHelpCenterSource`), replacing one with the same id. Call it from a server
 * plugin and list its id in `settings.sources`; a source that is not listed is never read.
 */
export function registerHelpCenterSource(source: HelpCenterSource): void {
  registry.set(source.id, source)
}

function publicConfig(): Partial<PublicModuleOptions> {
  return (useRuntimeConfig().public.helpCenter ?? {}) as Partial<PublicModuleOptions>
}

/**
 * The enabled sources in the order they are merged, because the first source with a slug wins. For `articles` that is
 * `settings.sources` with the one named by `content.precedence` first; `categories` always put the database first, so a
 * category hidden from the reader keeps claiming its slug whatever the precedence. An id nobody registered is skipped
 * with one warning.
 */
export function helpCenterSources(of: 'articles' | 'categories' = 'articles'): HelpCenterSource[] {
  const ids = publicConfig().sources?.length ? publicConfig().sources! : ['database']
  const precedence = (useRuntimeConfig().helpCenter as { content?: { precedence?: string } } | undefined)?.content?.precedence ?? 'database'
  const ordered = orderSourceIds(ids, of === 'categories' ? 'database' : precedence)
  const sources: HelpCenterSource[] = []
  for (const id of ordered) {
    const source = id === 'database' ? helpCenterDatabaseSource : id === 'content' ? helpCenterContentSource() : registry.get(id)
    if (source) sources.push(source)
    else if (!warned.has(id)) {
      warned.add(id)
      console.warn(`[@frigear-nu/help-center] the source "${id}" is listed in \`settings.sources\` but nothing registered it.`)
    }
  }
  return sources
}

// --- Who reads -------------------------------------------------------------------------------

export type HelpCenterRequest = HelpSourceContext & { user: { id: string | number } | null }

/** Caches `canRead` per record object for one reader: the rows of a request are read once and checked many times. */
function memoReader(canRead: (record: { grants: unknown }) => Promise<boolean>): HelpReader['canRead'] {
  const seen = new WeakMap<object, Promise<boolean>>()
  return (record) => {
    if (!seen.has(record)) seen.set(record, canRead(record))
    return seen.get(record)!
  }
}

/**
 * The reader of a request. With `public` it is an anonymous visitor's, whoever asks: only `public` grants admit, nothing
 * depends on the caller, so the answer can be cached. Otherwise records are read through `grantsCanRead`: a `public`
 * grant needs no sign-in, anything else goes through `help-center:read` and its policy. Anonymous callers, and tokens
 * without `help-center:read`, read public records only.
 */
export async function helpCenterRequest(event: H3Event, options: { public?: boolean } = {}): Promise<HelpCenterRequest> {
  const requiredLocales = helpCenterRequiredLocales()
  if (options.public) {
    const reader: HelpReader = { user: null, canRead: async record => hasPublicGrant(record.grants) }
    return { event, reader, requiredLocales, user: null }
  }
  const principal = await allows(event, helpCenterAccess.permissions.read) ? await getAuth(event) : null
  const user = principal?.user ?? null
  const reader: HelpReader = { user, canRead: memoReader(record => grantsCanRead(event, helpCenterAccess.permissions.read, record)) }
  return { event, reader, requiredLocales, user }
}

/**
 * A reader for another user than the caller (a send): the user's own grants decide, as `grantsMatch` answers them for
 * that user. It does not look at the caller's token or session.
 */
export function helpCenterReaderFor(event: H3Event, user: { id: string | number }): HelpReader {
  return { user, canRead: memoReader(record => grantsMatch(event, user, record.grants)) }
}

// --- Reading ---------------------------------------------------------------------------------

/**
 * Every category of every source, merged by slug (the first source wins), with whether the reader may read it. A
 * category the reader may not read still claims its slug, so a content-derived category cannot replace it.
 */
export async function helpCenterMergedCategories(ctx: HelpSourceContext): Promise<HelpSourceCategory[]> {
  return mergeBySlug(await Promise.all(helpCenterSources('categories').map(async source => source.categories(ctx))))
}

const toCategoryDto = ({ visible: _visible, ...category }: HelpSourceCategory): HelpCategoryDto => category

/** The categories the reader may read, in their order. */
export async function helpCenterCategories(ctx: HelpSourceContext): Promise<HelpCategoryDto[]> {
  return (await helpCenterMergedCategories(ctx)).filter(category => category.visible).map(toCategoryDto)
}

/**
 * The articles the reader may read, without their text, in the order of their categories and then their own.
 * An article whose category the reader may not read is left out of the listing: that is how a content article (always
 * public) in a restricted database category stays out of the category's pages. It can still be opened by its URL.
 */
export async function helpCenterArticles(ctx: HelpSourceContext, query: { q?: string, category?: string } = {}): Promise<HelpArticleSummaryDto[]> {
  const categories = await helpCenterMergedCategories(ctx)
  const visible = new Map(categories.filter(category => category.visible).map((category, index) => [category.slug, index]))
  const lists = await Promise.all(helpCenterSources().map(async source => source.list({ ...ctx, ...query })))
  return mergeBySlug(lists)
    .filter(article => visible.has(article.categorySlug) && (!query.category || article.categorySlug === query.category))
    .sort((a, b) => visible.get(a.categorySlug)! - visible.get(b.categorySlug)! || a.sort - b.sort || a.slug.localeCompare(b.slug))
    .map(toHelpArticleSummary)
}

/** One article by its URL name with its category, or `undefined` when it does not exist or the reader may not read it. */
export async function helpCenterArticle(ctx: HelpSourceContext, slug: string): Promise<HelpArticleDetailDto | undefined> {
  let article: HelpArticleDto | undefined
  for (const source of helpCenterSources()) {
    article = await source.get(slug, ctx)
    if (article) break
  }
  if (!article) return undefined
  const category = (await helpCenterMergedCategories(ctx)).find(entry => entry.slug === article!.categorySlug && entry.visible)
  return { ...article, category: category ? toCategoryDto(category) : null }
}

/** One article by its id (`hlp_...`, `content:...`), or `undefined` when it does not exist or the reader may not read it. */
export async function helpCenterArticleById(ctx: HelpSourceContext, id: string): Promise<HelpArticleDto | undefined> {
  for (const source of helpCenterSources()) {
    const article = source.getById
      ? await source.getById(id, ctx)
      : (await source.list(ctx)).find(entry => entry.id === id)
    if (article) return article
  }
  return undefined
}

/**
 * Categories with the published articles the reader may read, text included: what the FAQ cards show. `slugs` names the
 * categories in the order to show them (one the reader may not read, or that does not exist, is left out); without
 * slugs every accordion and cards category (the FAQs) the reader may read, in their order. Articles follow their own order.
 */
export async function helpCenterFaqs(ctx: HelpSourceContext, slugs: string[] = []): Promise<HelpFaqDto[]> {
  const categories = (await helpCenterMergedCategories(ctx)).filter(category => category.visible).map(toCategoryDto)
  const bySlug = new Map(categories.map(category => [category.slug, category]))
  const wanted = slugs.length
    ? slugs.map(slug => bySlug.get(slug)).filter((category): category is HelpCategoryDto => !!category)
    : categories.filter(category => category.display === 'accordion' || category.display === 'cards')
  return Promise.all(wanted.map(async (category) => {
    const lists = await Promise.all(helpCenterSources().map(async source => source.list({ ...ctx, category: category.slug })))
    const articles = mergeBySlug(lists)
      .filter(article => article.categorySlug === category.slug)
      .sort((a, b) => a.sort - b.sort || a.slug.localeCompare(b.slug))
    return { ...category, articles }
  }))
}
