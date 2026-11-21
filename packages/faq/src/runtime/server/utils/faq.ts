import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, is, or, sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { isVisible, parseVisibility } from '@frigear-nu/audience'
import type { OwnerRef, Viewer, Visibility } from '@frigear-nu/audience'
import { resolveOwner, resolveViewer } from '@frigear-nu/audience/server'
import { apiError, conflict, escapeLike, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type { AdminFaqGroupDto, FaqGroupDto, FaqItemStatus, FaqSearchResult } from '../../../types'
import { checkReorder, describeMissingTranslations, DEFAULT_REQUIRED_LOCALES, isFaqItemVisible, isValidReorder, missingTranslations, newId, normalizeVisibility } from '../../utils'
import { toAdminFaqGroupDto, toFaqGroupDto, toFaqItemDto } from './faq-dto'
import { isFaqUniqueViolation } from './faq-errors'
import type { faqGroupInput, faqGroupPatchSchema, faqItemInput, faqItemPatchSchema } from './faq-schemas'

export type FaqGroupRow = typeof schema.faqGroups.$inferSelect
export type FaqItemRow = typeof schema.faqItems.$inferSelect
type GroupInput = z.output<typeof faqGroupInput>
type GroupPatch = z.output<typeof faqGroupPatchSchema>
type ItemInput = z.output<typeof faqItemInput>
type ItemPatch = z.output<typeof faqItemPatchSchema>

const PLATFORM: OwnerRef = { type: 'platform', id: null }

// --- Lookups --------------------------------------------------------------------------------

export async function findFaqGroupById(id: string): Promise<FaqGroupRow | undefined> {
  const [row] = await db.select().from(schema.faqGroups).where(eq(schema.faqGroups.id, id)).limit(1)
  return row
}

export async function findFaqGroupBySlug(slug: string): Promise<FaqGroupRow | undefined> {
  const [row] = await db.select().from(schema.faqGroups).where(eq(schema.faqGroups.slug, slug)).limit(1)
  return row
}

/** The group with this id, or a 404. */
export async function getFaqGroupOr404(id: string): Promise<FaqGroupRow> {
  const row = await findFaqGroupById(id)
  if (!row) throw notFound('FAQ group not found.')
  return row
}

export async function findFaqItemById(id: string): Promise<FaqItemRow | undefined> {
  const [row] = await db.select().from(schema.faqItems).where(eq(schema.faqItems.id, id)).limit(1)
  return row
}

/** The item with this id, or a 404. */
export async function getFaqItemOr404(id: string): Promise<FaqItemRow> {
  const row = await findFaqItemById(id)
  if (!row) throw notFound('FAQ item not found.')
  return row
}

/** Every item of a group, any status, in their order. */
export async function listFaqItemRows(groupId: string): Promise<FaqItemRow[]> {
  return db.select().from(schema.faqItems).where(eq(schema.faqItems.groupId, groupId))
    .orderBy(asc(schema.faqItems.sort), asc(schema.faqItems.createdAt), asc(schema.faqItems.id))
}

/** Item and published counts per group id. Groups with no items are not in the map. */
export async function faqGroupCounts(groupIds: string[]): Promise<Map<string, { itemCount: number, publishedCount: number }>> {
  const counts = new Map<string, { itemCount: number, publishedCount: number }>()
  if (!groupIds.length) return counts
  const rows = await db.select({
    groupId: schema.faqItems.groupId,
    total: count(),
    published: sql<number>`sum(case when ${schema.faqItems.status} = 'published' then 1 else 0 end)`,
  }).from(schema.faqItems).where(inArray(schema.faqItems.groupId, groupIds)).groupBy(schema.faqItems.groupId)
  for (const row of rows) counts.set(row.groupId, { itemCount: Number(row.total), publishedCount: Number(row.published ?? 0) })
  return counts
}

/** The staff DTO of a group with its current counts, for the hooks and for responses that follow an item change. */
export async function faqGroupHookDto(group: FaqGroupRow | string): Promise<AdminFaqGroupDto> {
  const row = typeof group === 'string' ? await getFaqGroupOr404(group) : group
  const counts = await faqGroupCounts([row.id])
  return toAdminFaqGroupDto(row, counts.get(row.id))
}

/** Calls `faq:group:updated` with the group as it is now. */
export async function callFaqGroupUpdated(event: H3Event, group: FaqGroupRow | string): Promise<AdminFaqGroupDto> {
  const dto = await faqGroupHookDto(group)
  await useNitroApp().hooks.callHook('faq:group:updated', { event, group: dto })
  return dto
}

/** The locales an item must have before it is published (the `requiredLocales` option). */
export function faqRequiredLocales(): string[] {
  const configured = (useRuntimeConfig().public.faq as { requiredLocales?: string[] } | undefined)?.requiredLocales
  return configured?.length ? configured : [...DEFAULT_REQUIRED_LOCALES]
}

// --- Who is looking --------------------------------------------------------------------------

/**
 * Who is looking, through `audience:viewer:resolve` (team roles, ladders and operations come from the modules that know
 * them). Resolve it once per request. Anonymous visitors get an empty viewer without calling the hook.
 */
export async function resolveFaqViewer(event: H3Event, user: { id: string | number } | null): Promise<Viewer> {
  return resolveViewer(event, {
    hooks: useNitroApp().hooks,
    user,
    globalRoles: user ? await getEffectiveRoles(event, user as Parameters<typeof getEffectiveRoles>[1]) : [],
  })
}

// --- Reading ---------------------------------------------------------------------------------

/**
 * Case-insensitive search of a translated json column (a plain string, or a locale -> text map) for `value` in any
 * language. Matches the texts only, never the locale keys. sqlite reads the json with `json_each` (a json string scalar
 * yields one row); postgresql with `jsonb_each_text`, wrapping a string scalar in an object first.
 */
export function faqTranslatedContains(column: AnyColumn, value: string): SQL {
  const pattern = `%${escapeLike(value)}%`
  if (is(schema.faqItems, PgTable)) {
    return sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${column}) = 'object' then ${column} else jsonb_build_object('_', ${column}) end) as t where lower(t.value) like lower(${pattern}) escape '\\')`
  }
  return sql`exists (select 1 from json_each(${column}) as t where lower(t.value) like lower(${pattern}) escape '\\')`
}

/**
 * The groups a viewer reads, each with its published items they may read, in `sort` order (or in the order of `slugs`
 * when given). A group the viewer may not read is left out, and so is a group that does not exist. `operationId` keeps the
 * groups owned by that operation.
 */
export async function loadFaqGroups(options: { viewer: Viewer, slugs?: string[], operationId?: string }): Promise<FaqGroupDto[]> {
  const { viewer, slugs = [], operationId } = options
  const conditions: (SQL | undefined)[] = []
  if (slugs.length) conditions.push(inArray(schema.faqGroups.slug, slugs))
  if (operationId) conditions.push(and(eq(schema.faqGroups.ownerType, 'operation'), eq(schema.faqGroups.ownerId, operationId)))
  const rows = await db.select().from(schema.faqGroups).where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(schema.faqGroups.sort), asc(schema.faqGroups.createdAt), asc(schema.faqGroups.id))
  const visible = rows.filter(row => isVisible(parseVisibility(row.visibility), viewer))
  if (slugs.length) visible.sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug))
  if (!visible.length) return []

  const items = await db.select().from(schema.faqItems)
    .where(and(inArray(schema.faqItems.groupId, visible.map(row => row.id)), eq(schema.faqItems.status, 'published')))
    .orderBy(asc(schema.faqItems.sort), asc(schema.faqItems.createdAt), asc(schema.faqItems.id))
  return visible.map(group => toFaqGroupDto(group, items.filter(item => item.groupId === group.id && isFaqItemVisible(group, item, viewer))))
}

/** One group by URL name for a viewer, or `undefined` when it does not exist or they may not read it. */
export async function loadFaqGroup(slug: string, viewer: Viewer): Promise<FaqGroupDto | undefined> {
  const [group] = await loadFaqGroups({ viewer, slugs: [slug] })
  return group
}

/** The most items a search looks at before the viewer's visibility filters them; it answers 50 at most. */
const SEARCH_CANDIDATES = 500
const SEARCH_LIMIT = 50

/**
 * Published items whose question or answer contains `query` in any language, among the ones the viewer may read, in the
 * order of the groups and items.
 */
export async function searchFaq(options: { viewer: Viewer, query: string, operationId?: string }): Promise<FaqSearchResult[]> {
  const { viewer, query, operationId } = options
  const candidates = await db.select().from(schema.faqItems)
    .where(and(
      eq(schema.faqItems.status, 'published'),
      or(faqTranslatedContains(schema.faqItems.question, query), faqTranslatedContains(schema.faqItems.answer, query)),
    ))
    .limit(SEARCH_CANDIDATES)
  if (!candidates.length) return []
  const groups = await db.select().from(schema.faqGroups).where(inArray(schema.faqGroups.id, [...new Set(candidates.map(item => item.groupId))]))
  const byId = new Map(groups.map(group => [group.id, group]))
  return candidates
    .map(item => ({ item, group: byId.get(item.groupId)! }))
    .filter(({ item, group }) => group
      && (!operationId || (group.ownerType === 'operation' && group.ownerId === operationId))
      && isFaqItemVisible(group, item, viewer))
    .sort((a, b) => a.group.sort - b.group.sort || a.group.id.localeCompare(b.group.id) || a.item.sort - b.item.sort || a.item.id.localeCompare(b.item.id))
    .slice(0, SEARCH_LIMIT)
    .map(({ item, group }) => ({
      group: { id: group.id, slug: group.slug, title: group.title },
      item: toFaqItemDto(group, item),
    }))
}

// --- Writing ---------------------------------------------------------------------------------

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** `409 conflict` when another group already uses `slug`. */
export async function assertFaqSlugFree(slug: string, exceptId?: string): Promise<void> {
  const taken = await findFaqGroupBySlug(slug)
  if (taken && taken.id !== exceptId) throw conflict('A FAQ group with this slug already exists.', { field: 'slug' })
}

/** Two requests can pass the slug pre-check together: the unique index decides, and the loser gets the same 409. */
function rethrowSlugConflict(error: unknown): never {
  if (isFaqUniqueViolation(error)) throw conflict('A FAQ group with this slug already exists.', { field: 'slug' })
  throw error
}

/**
 * 400 when the owner does not exist. `platform` has no id; every other type must be answered by its module through
 * `audience:owner:resolve` (operations answers for `operation`). A type nobody answers cannot be verified, so it is
 * refused too.
 */
export async function assertFaqOwner(event: H3Event, owner: OwnerRef): Promise<void> {
  if (owner.type === 'platform') {
    if (owner.id) throw validationError([{ path: ['owner', 'id'], message: 'The platform owner has no id.' }])
    return
  }
  if (!owner.id) throw validationError([{ path: ['owner', 'id'], message: 'An owner of this type needs an id.' }])
  const resolved = await resolveOwner(event, owner, { hooks: useNitroApp().hooks })
  if (resolved.exists !== true) {
    throw validationError([{ path: ['owner'], message: 'This owner does not exist.' }], 'Unknown owner')
  }
}

const blankToNull = (value: string | null | undefined) => value?.trim() ? value.trim() : null

const ownerValue = (owner: { type: string, id?: string | null } | undefined): OwnerRef =>
  owner ? { type: owner.type, id: owner.id ?? null } : PLATFORM

async function nextGroupSort(): Promise<number> {
  const [row] = await db.select({ max: sql<number | null>`max(${schema.faqGroups.sort})` }).from(schema.faqGroups)
  return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1
}

async function nextItemSort(groupId: string): Promise<number> {
  const [row] = await db.select({ max: sql<number | null>`max(${schema.faqItems.sort})` }).from(schema.faqItems).where(eq(schema.faqItems.groupId, groupId))
  return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1
}

/** Inserts a group after the slug and owner checks. */
export async function createFaqGroupRow(event: H3Event, input: GroupInput): Promise<FaqGroupRow> {
  await assertFaqSlugFree(input.slug)
  const owner = ownerValue(input.owner)
  await assertFaqOwner(event, owner)
  const [row] = await db.insert(schema.faqGroups).values({
    id: newId('faq'),
    slug: input.slug,
    title: input.title,
    description: input.description ?? null,
    icon: blankToNull(input.icon),
    ownerType: owner.type,
    ownerId: owner.id,
    visibility: normalizeVisibility(input.visibility as Visibility | null | undefined),
    sort: input.sort ?? await nextGroupSort(),
  }).returning().catch(rethrowSlugConflict)
  return row!
}

/** Applies a partial update to `existing`, after the slug and owner checks; returns the updated row (or `existing` when nothing changed). */
export async function patchFaqGroupRow(event: H3Event, existing: FaqGroupRow, patch: GroupPatch): Promise<FaqGroupRow> {
  if (patch.slug) await assertFaqSlugFree(patch.slug, existing.id)
  const owner = patch.owner ? ownerValue(patch.owner) : undefined
  // An unchanged owner is not checked again: a group whose operation was deleted can still be edited.
  if (owner && !(owner.type === existing.ownerType && owner.id === (existing.ownerId ?? null))) await assertFaqOwner(event, owner)
  const values: Partial<typeof schema.faqGroups.$inferInsert> = {}
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.title !== undefined) values.title = patch.title
  if (patch.description !== undefined) values.description = patch.description
  if (patch.icon !== undefined) values.icon = blankToNull(patch.icon)
  if (owner) {
    values.ownerType = owner.type
    values.ownerId = owner.id
  }
  if (patch.visibility !== undefined) values.visibility = normalizeVisibility(patch.visibility as Visibility | null)
  if (patch.sort !== undefined) values.sort = patch.sort
  const changed: Partial<typeof schema.faqGroups.$inferInsert> = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !sameValue(value, existing[key as keyof FaqGroupRow])),
  )
  if (!Object.keys(changed).length) return existing
  const [row] = await db.update(schema.faqGroups).set(changed).where(eq(schema.faqGroups.id, existing.id)).returning().catch(rethrowSlugConflict)
  return row!
}

/** Deletes a group and its items. */
export async function deleteFaqGroupRow(id: string): Promise<void> {
  await db.delete(schema.faqItems).where(eq(schema.faqItems.groupId, id))
  await db.delete(schema.faqGroups).where(eq(schema.faqGroups.id, id))
}

/** `409 missing_translations` when the item lacks a required locale in its question or answer. */
export function assertFaqPublishable(item: Pick<FaqItemRow, 'question' | 'answer'>): void {
  const missing = missingTranslations(item, faqRequiredLocales())
  if (missing.length) throw apiError(409, 'missing_translations', describeMissingTranslations(missing), { missing })
}

/** Inserts a draft item at the end of the group. */
export async function createFaqItemRow(group: FaqGroupRow, input: ItemInput, userId: string | number): Promise<FaqItemRow> {
  const [row] = await db.insert(schema.faqItems).values({
    id: newId('fqi'),
    groupId: group.id,
    question: input.question,
    answer: input.answer,
    icon: blankToNull(input.icon),
    links: input.links?.length ? input.links : null,
    status: 'draft',
    visibility: normalizeVisibility(input.visibility as Visibility | null | undefined),
    sort: await nextItemSort(group.id),
    updatedBy: String(userId),
  }).returning()
  return row!
}

/**
 * Applies a partial update to `existing`; returns the updated row (or `existing` when nothing changed). A published item
 * must keep every required locale, so an edit that removes one is `409 missing_translations`.
 */
export async function patchFaqItemRow(existing: FaqItemRow, patch: ItemPatch, userId: string | number): Promise<FaqItemRow> {
  const values: Partial<typeof schema.faqItems.$inferInsert> = {}
  if (patch.question !== undefined) values.question = patch.question
  if (patch.answer !== undefined) values.answer = patch.answer
  if (patch.icon !== undefined) values.icon = blankToNull(patch.icon)
  if (patch.links !== undefined) values.links = patch.links?.length ? patch.links : null
  if (patch.visibility !== undefined) values.visibility = normalizeVisibility(patch.visibility as Visibility | null)
  const changed: Partial<typeof schema.faqItems.$inferInsert> = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !sameValue(value, existing[key as keyof FaqItemRow])),
  )
  if (!Object.keys(changed).length) return existing
  if (existing.status === 'published') assertFaqPublishable({ question: changed.question ?? existing.question, answer: changed.answer ?? existing.answer })
  const [row] = await db.update(schema.faqItems).set({ ...changed, updatedBy: String(userId) }).where(eq(schema.faqItems.id, existing.id)).returning()
  return row!
}

/** Moves an item to `status`, recording who did it. Conditional on the status read, so two staff members cannot both win. */
export async function setFaqItemStatus(existing: FaqItemRow, status: FaqItemStatus, userId: string | number): Promise<FaqItemRow | undefined> {
  const [row] = await db.update(schema.faqItems).set({ status, updatedBy: String(userId) })
    .where(and(eq(schema.faqItems.id, existing.id), eq(schema.faqItems.status, existing.status))).returning()
  return row
}

/**
 * Puts a group's items in the order of `itemIds`, which must be exactly the group's item ids (any status), each once;
 * otherwise `400 invalid_order` with what is missing, unknown or repeated. Returns the items in their new order.
 */
export async function reorderFaqItems(groupId: string, itemIds: string[]): Promise<FaqItemRow[]> {
  const current = await listFaqItemRows(groupId)
  const problems = checkReorder(current.map(item => item.id), itemIds)
  if (!isValidReorder(problems)) {
    throw apiError(400, 'invalid_order', 'The order must list every item of the group exactly once.', problems)
  }
  for (const [index, id] of itemIds.entries()) {
    await db.update(schema.faqItems).set({ sort: index }).where(and(eq(schema.faqItems.id, id), eq(schema.faqItems.groupId, groupId)))
  }
  return listFaqItemRows(groupId)
}
