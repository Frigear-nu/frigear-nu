import type { schema } from '@nuxthub/db'
import { readGrants } from '@frigear-nu/auth/grants'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminHelpArticleDto, AdminHelpCategoryDto, HelpArticleDto, HelpArticleStatus, HelpArticleSummaryDto, HelpCategoryDisplay, HelpCategoryDto, HelpCategoryKind, HelpSourceArticle } from '../../../types'
import { isHelpArticlePublic, isHelpChainPublic } from '../../utils/grants'

export type HelpCategoryRow = typeof schema.helpCategories.$inferSelect
export type HelpArticleRow = typeof schema.helpArticles.$inferSelect

const iso = (value: Date | null | undefined) => value ? isoDate(value) : null

/** The stored display of a category; anything unknown reads as `list`. */
export const helpCategoryDisplay = (value: string | null | undefined): HelpCategoryDisplay => value === 'accordion' || value === 'cards' ? value : 'list'

/** The stored kind of a category; anything unknown reads as `help`. */
export const helpCategoryKind = (value: string | null | undefined): HelpCategoryKind => value === 'faq' ? 'faq' : 'help'

/** What anybody who may read the category sees: an allowlist of the row's fields (no owner, grants or audit data). */
export function toHelpCategoryDto(row: HelpCategoryRow, chain: HelpCategoryRow[] = [row]): HelpCategoryDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    parentId: row.parentId ?? null,
    sort: row.sort,
    // Public only when the category and every ancestor are.
    public: isHelpChainPublic(chain),
    source: 'database',
    kind: helpCategoryKind(row.kind),
    display: helpCategoryDisplay(row.display),
    icon: row.icon ?? null,
  }
}

/** An article without its text, as the reader who may read it sees it. */
export function toHelpArticleSummaryDto(category: HelpCategoryRow, row: HelpArticleRow, chain: HelpCategoryRow[] = [category]): HelpArticleSummaryDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categorySlug: category.slug,
    kind: helpCategoryKind(category.kind),
    source: 'database',
    public: isHelpArticlePublic(chain, row),
    icon: row.icon ?? null,
    sort: row.sort,
    publishedAt: iso(row.publishedAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toHelpArticleDto(category: HelpCategoryRow, row: HelpArticleRow, chain: HelpCategoryRow[] = [category]): HelpArticleDto {
  return { ...toHelpArticleSummaryDto(category, row, chain), body: row.body, links: row.links ?? [] }
}

/** The list shape of an article: the text left out. */
export function toHelpArticleSummary(article: HelpArticleDto): HelpArticleSummaryDto {
  const { body: _body, links: _links, ...summary } = article
  return summary
}

/** The staff view of a category: the owner, its grants, the article count and the audit dates. */
export function toAdminHelpCategoryDto(row: HelpCategoryRow, articleCount = 0): AdminHelpCategoryDto {
  const { source: _source, ...category } = toHelpCategoryDto(row)
  return {
    ...category,
    owner: { type: row.ownerType, id: row.ownerId ?? null },
    grants: readGrants(row.grants),
    articleCount,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** The staff view of an article: every field, whatever its status. */
export function toAdminHelpArticleDto(category: Pick<HelpCategoryRow, 'slug' | 'kind'>, row: HelpArticleRow): AdminHelpArticleDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    categoryId: row.categoryId,
    categorySlug: category.slug,
    kind: helpCategoryKind(category.kind),
    status: row.status as HelpArticleStatus,
    grants: row.grants === null || row.grants === undefined ? null : readGrants(row.grants),
    icon: row.icon ?? null,
    links: row.links ?? [],
    source: 'database',
    readOnly: false,
    sort: row.sort,
    publishedAt: iso(row.publishedAt),
    updatedBy: row.updatedBy ?? null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** The staff view of an article of a read-only source (Nuxt Content): always published and public. */
export function toAdminContentArticleDto(article: HelpSourceArticle): AdminHelpArticleDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    body: article.body,
    categoryId: null,
    categorySlug: article.categorySlug,
    kind: article.kind ?? 'help',
    status: 'published',
    grants: [{ kind: 'public' }],
    icon: article.icon,
    links: article.links,
    source: article.source,
    readOnly: true,
    sort: article.sort,
    publishedAt: article.publishedAt,
    updatedBy: null,
    createdAt: null,
    updatedAt: article.updatedAt,
  }
}
