import type { schema } from '@nuxthub/db'
import { hasPublicGrant, readGrants } from '@frigear-nu/grants/core'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminFaqGroupDto, AdminFaqItemDto, FaqGroupDto, FaqItemDto, FaqItemStatus } from '../../../types'
import { isFaqItemPublic } from '../../utils'

type GroupRow = typeof schema.faqGroups.$inferSelect
type ItemRow = typeof schema.faqItems.$inferSelect

const ownerOf = (row: GroupRow) => ({ type: row.ownerType, id: row.ownerId ?? null })

/** What anybody who may read the item sees: an allowlist of the row's fields (no status, grants or audit data). */
export function toFaqItemDto(group: Pick<GroupRow, 'grants'>, row: ItemRow): FaqItemDto {
  return {
    id: row.id,
    groupId: row.groupId,
    question: row.question,
    answer: row.answer,
    icon: row.icon ?? null,
    links: row.links ?? [],
    sort: row.sort,
    public: isFaqItemPublic(group, row),
  }
}

/** A group with the published items the viewer may read, already filtered by the caller. */
export function toFaqGroupDto(row: GroupRow, items: ItemRow[]): FaqGroupDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    icon: row.icon ?? null,
    owner: ownerOf(row),
    sort: row.sort,
    public: hasPublicGrant(row.grants),
    items: items.map(item => toFaqItemDto(row, item)),
  }
}

/** The staff view of a group: no items, but its grants, the counts and the audit dates. */
export function toAdminFaqGroupDto(row: GroupRow, counts: { itemCount: number, publishedCount: number } = { itemCount: 0, publishedCount: 0 }): AdminFaqGroupDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    icon: row.icon ?? null,
    owner: ownerOf(row),
    sort: row.sort,
    public: hasPublicGrant(row.grants),
    grants: readGrants(row.grants),
    itemCount: counts.itemCount,
    publishedCount: counts.publishedCount,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** The staff view of an item: every field, whatever its status. */
export function toAdminFaqItemDto(row: ItemRow): AdminFaqItemDto {
  return {
    id: row.id,
    groupId: row.groupId,
    question: row.question,
    answer: row.answer,
    icon: row.icon ?? null,
    links: row.links ?? [],
    sort: row.sort,
    status: row.status as FaqItemStatus,
    grants: row.grants === null || row.grants === undefined ? null : readGrants(row.grants),
    updatedBy: row.updatedBy ?? null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}
