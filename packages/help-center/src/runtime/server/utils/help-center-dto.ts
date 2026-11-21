import type { schema } from '@nuxthub/db'
import { parseVisibility } from '@frigear-nu/audience'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminHelpArticleDto, AdminHelpCategoryDto, HelpArticleDto, HelpArticleStatus, HelpArticleSummaryDto, HelpCategoryDto } from '../../../types'
import { isHelpArticleVisibleIn } from '../../utils/visibility'

export type HelpCategoryRow = typeof schema.helpCategories.$inferSelect
export type HelpArticleRow = typeof schema.helpArticles.$inferSelect

const iso = (value: Date | null | undefined) => value ? isoDate(value) : null

/** What anybody who may read the category sees: an allowlist of the row's fields (no owner, visibility or audit data). */
export function toHelpCategoryDto(row: HelpCategoryRow, chain: HelpCategoryRow[] = [row]): HelpCategoryDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    parentId: row.parentId ?? null,
    sort: row.sort,
    // Public only when the category and every ancestor are.
    public: chain.every(node => parseVisibility(node.visibility)?.public === true),
    source: 'database',
    faqGroups: row.faqGroups ?? [],
  }
}

/** An article without its text, as the viewer who may read it sees it. */
export function toHelpArticleSummaryDto(category: HelpCategoryRow, row: HelpArticleRow, chain: HelpCategoryRow[] = [category]): HelpArticleSummaryDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categorySlug: category.slug,
    source: 'database',
    public: isHelpArticleVisibleIn(chain, row, null),
    sort: row.sort,
    publishedAt: iso(row.publishedAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function toHelpArticleDto(category: HelpCategoryRow, row: HelpArticleRow, chain: HelpCategoryRow[] = [category]): HelpArticleDto {
  return { ...toHelpArticleSummaryDto(category, row, chain), body: row.body }
}

/** The list shape of an article: the text left out. */
export function toHelpArticleSummary(article: HelpArticleDto): HelpArticleSummaryDto {
  const { body: _body, ...summary } = article
  return summary
}

/** The staff view of a category: the owner, the visibility, the article count and the audit dates. */
export function toAdminHelpCategoryDto(row: HelpCategoryRow, articleCount = 0): AdminHelpCategoryDto {
  const { source: _source, ...category } = toHelpCategoryDto(row)
  return {
    ...category,
    owner: { type: row.ownerType, id: row.ownerId ?? null },
    visibility: parseVisibility(row.visibility),
    articleCount,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** The staff view of an article: every field, whatever its status. */
export function toAdminHelpArticleDto(category: Pick<HelpCategoryRow, 'slug'>, row: HelpArticleRow): AdminHelpArticleDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    categoryId: row.categoryId,
    categorySlug: category.slug,
    status: row.status as HelpArticleStatus,
    visibility: parseVisibility(row.visibility),
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
export function toAdminContentArticleDto(article: HelpArticleDto): AdminHelpArticleDto {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    body: article.body,
    categoryId: null,
    categorySlug: article.categorySlug,
    status: 'published',
    visibility: { public: true },
    source: article.source,
    readOnly: true,
    sort: article.sort,
    publishedAt: article.publishedAt,
    updatedBy: null,
    createdAt: null,
    updatedAt: article.updatedAt,
  }
}
