import type { H3Event } from 'h3'
import { createViewer } from '@frigear-nu/audience'
import { resolveViewer } from '@frigear-nu/audience/server'
import { helpCenterAccess } from '../../access'
import type { HelpArticleDetailDto, HelpArticleDto, HelpArticleSummaryDto, HelpCategoryDto, HelpCenterSource, HelpSourceCategory, HelpSourceContext, PublicModuleOptions } from '../../../types'
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
 * category hidden from the viewer keeps claiming its slug whatever the precedence. An id nobody registered is skipped
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

// --- Who is looking --------------------------------------------------------------------------

export type HelpCenterRequest = HelpSourceContext & { user: { id: string | number } | null }

/**
 * The context of a read request. With `public` it is an anonymous visitor's, whoever asks: nothing in the answer
 * depends on the caller, so it can be cached. Otherwise the viewer is resolved through `audience:viewer:resolve` (team
 * roles, ladders and operations come from the modules that know them), once per request. Anonymous callers, and tokens
 * without `help-center:read`, get an empty viewer: public articles only.
 */
export async function helpCenterRequest(event: H3Event, options: { public?: boolean } = {}): Promise<HelpCenterRequest> {
  const requiredLocales = helpCenterRequiredLocales()
  if (options.public) return { event, viewer: createViewer(), requiredLocales, user: null }
  const principal = await allows(event, helpCenterAccess.permissions.read) ? await getAuth(event) : null
  const user = principal?.user ?? null
  const viewer = await resolveViewer(event, {
    hooks: useNitroApp().hooks,
    user,
    globalRoles: user ? await getEffectiveRoles(event, user as Parameters<typeof getEffectiveRoles>[1]) : [],
  })
  return { event, viewer, requiredLocales, user }
}

// --- Reading ---------------------------------------------------------------------------------

/**
 * Every category of every source, merged by slug (the first source wins), with whether the viewer may read it. A
 * category the viewer may not read still claims its slug, so a content-derived category cannot replace it.
 */
export async function helpCenterMergedCategories(ctx: HelpSourceContext): Promise<HelpSourceCategory[]> {
  return mergeBySlug(await Promise.all(helpCenterSources('categories').map(async source => source.categories(ctx))))
}

const toCategoryDto = ({ visible: _visible, ...category }: HelpSourceCategory): HelpCategoryDto => category

/**
 * Keeps, on each category, the FAQ groups `@frigear-nu/faq` itself would show this viewer: asked of its own route (as a
 * visitor for an anonymous viewer, as the caller otherwise), so the slug of a restricted FAQ group never reaches
 * people who cannot read it. Without faq, or when it cannot be asked, no group is listed.
 */
async function withVisibleFaqGroups(ctx: HelpSourceContext, categories: HelpCategoryDto[]): Promise<HelpCategoryDto[]> {
  const slugs = [...new Set(categories.flatMap(category => category.faqGroups))]
  if (!slugs.length) return categories
  let shown = new Set<string>()
  if (publicConfig().faq) {
    try {
      const groups = await (ctx.event as unknown as { $fetch: <T>(url: string, init?: Record<string, unknown>) => Promise<T> })
        .$fetch<Array<{ slug: string }>>('/api/faq/groups', { query: { slugs: slugs.join(','), public: ctx.viewer.userId ? undefined : 1 } })
      shown = new Set(groups.map(group => group.slug))
    }
    catch (error) {
      console.warn('[@frigear-nu/help-center] could not ask @frigear-nu/faq which groups to show:', error)
    }
  }
  return categories.map(category => ({ ...category, faqGroups: category.faqGroups.filter(slug => shown.has(slug)) }))
}

/** The categories the viewer may read, in their order. */
export async function helpCenterCategories(ctx: HelpSourceContext): Promise<HelpCategoryDto[]> {
  return withVisibleFaqGroups(ctx, (await helpCenterMergedCategories(ctx)).filter(category => category.visible).map(toCategoryDto))
}

/**
 * The articles the viewer may read, without their text, in the order of their categories and then their own.
 * An article whose category the viewer may not read is left out of the listing: that is how a content article (always
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

/** One article by its URL name with its category, or `undefined` when it does not exist or the viewer may not read it. */
export async function helpCenterArticle(ctx: HelpSourceContext, slug: string): Promise<HelpArticleDetailDto | undefined> {
  let article: HelpArticleDto | undefined
  for (const source of helpCenterSources()) {
    article = await source.get(slug, ctx)
    if (article) break
  }
  if (!article) return undefined
  const category = (await helpCenterMergedCategories(ctx)).find(entry => entry.slug === article!.categorySlug && entry.visible)
  return { ...article, category: category ? (await withVisibleFaqGroups(ctx, [toCategoryDto(category)]))[0]! : null }
}

/** One article by its id (`hlp_...`, `content:...`), or `undefined` when it does not exist or the viewer may not read it. */
export async function helpCenterArticleById(ctx: HelpSourceContext, id: string): Promise<HelpArticleDto | undefined> {
  for (const source of helpCenterSources()) {
    const article = source.getById
      ? await source.getById(id, ctx)
      : (await source.list(ctx)).find(entry => entry.id === id)
    if (article) return article
  }
  return undefined
}
