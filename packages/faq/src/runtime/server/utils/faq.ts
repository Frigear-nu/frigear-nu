import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, inArray, is, or, sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { hasPublicGrant } from '@frigear-nu/grants/core'
import type { Grant } from '@frigear-nu/grants/core'
import { apiError, conflict, escapeLike, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type { AdminFaqGroupDto, FaqGroupDto, FaqItemStatus, FaqSearchResult, OwnerRef } from '../../../types'
import { checkReorder, describeMissingTranslations, DEFAULT_REQUIRED_LOCALES, isFaqItemPublic, isFaqItemReadable, isValidReorder, missingTranslations, newId } from '../../utils'
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

// --- Who may read ----------------------------------------------------------------------------

/**
 * Who reads a group or an item. `public`: only what anonymous visitors read (a `public` grant), the same answer for
 * everyone. Otherwise the caller of `event`, through `grantsCanRead` and the `faq:read` policy.
 */
export type FaqReader = { event: H3Event, public?: boolean }

const faqCanRead = (reader: FaqReader) => (record: { grants: unknown }) =>
  reader.public ? Promise.resolve(hasPublicGrant(record.grants)) : grantsCanRead(reader.event, 'faq:read', record)

/** Whether the reader reads the group. */
export function faqCanReadGroup(reader: FaqReader, group: FaqGroupRow): Promise<boolean> {
  return faqCanRead(reader)(group)
}

/** Whether the reader reads the item: its group, and the item unless it inherits the group. */
export function faqCanReadItem(reader: FaqReader, group: FaqGroupRow, item: FaqItemRow): Promise<boolean> {
  if (reader.public) return Promise.resolve(isFaqItemPublic(group, item))
  return isFaqItemReadable(group, item, faqCanRead(reader))
}

// --- Reading ---------------------------------------------------------------------------------

/**
 * Search of a translated json column (a plain string, or a locale -> text map) for `value` in any language, ignoring
 * case. Matches the texts only, never the locale keys. sqlite reads the json with `json_each` (a json string scalar
 * yields one row); postgresql with `jsonb_each_text`, wrapping a string scalar in an object first.
 *
 * The needle is folded in JavaScript with `toLocaleLowerCase()`, which knows Danish letters. postgresql then lowercases
 * the stored text too (`lower()`, aware of non-ASCII letters). sqlite's `lower()` and `LIKE` only fold ASCII, so there
 * the stored text is compared with the lowercase and the uppercase needle: `øl` finds `ØL` and `Øl`. A stored text that
 * mixes cases of non-ASCII letters differently from the needle (`ØLæ` for `øLÆ`) can still be missed on sqlite.
 */
export function faqTranslatedContains(column: AnyColumn, value: string): SQL {
  const lower = `%${escapeLike(value.toLocaleLowerCase())}%`
  const upper = `%${escapeLike(value.toLocaleUpperCase())}%`
  if (is(schema.faqItems, PgTable)) {
    return sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${column}) = 'object' then ${column} else jsonb_build_object('_', ${column}) end) as t where lower(t.value) like ${lower} escape '\\')`
  }
  return sql`exists (select 1 from json_each(${column}) as t where t.value like ${lower} escape '\\' or t.value like ${upper} escape '\\')`
}

/**
 * The groups the reader reads, each with its published items they may read, in `sort` order (or in the order of `slugs`
 * when given). A group the reader may not read is left out, and so is a group that does not exist. `operationId` keeps
 * the groups owned by that operation.
 */
export async function loadFaqGroups(reader: FaqReader, options: { slugs?: string[], operationId?: string } = {}): Promise<FaqGroupDto[]> {
  const { slugs = [], operationId } = options
  const conditions: (SQL | undefined)[] = []
  if (slugs.length) conditions.push(inArray(schema.faqGroups.slug, slugs))
  if (operationId) conditions.push(and(eq(schema.faqGroups.ownerType, 'operation'), eq(schema.faqGroups.ownerId, operationId)))
  const rows = await db.select().from(schema.faqGroups).where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(schema.faqGroups.sort), asc(schema.faqGroups.createdAt), asc(schema.faqGroups.id))
  const visible: FaqGroupRow[] = []
  for (const row of rows) if (await faqCanReadGroup(reader, row)) visible.push(row)
  if (slugs.length) visible.sort((a, b) => slugs.indexOf(a.slug) - slugs.indexOf(b.slug))
  if (!visible.length) return []

  const items = await db.select().from(schema.faqItems)
    .where(and(inArray(schema.faqItems.groupId, visible.map(row => row.id)), eq(schema.faqItems.status, 'published')))
    .orderBy(asc(schema.faqItems.sort), asc(schema.faqItems.createdAt), asc(schema.faqItems.id))
  const groups: FaqGroupDto[] = []
  for (const group of visible) {
    const readable: FaqItemRow[] = []
    for (const item of items) if (item.groupId === group.id && await faqCanReadItem(reader, group, item)) readable.push(item)
    groups.push(toFaqGroupDto(group, readable))
  }
  return groups
}

/** One group by URL name for the reader, or `undefined` when it does not exist or they may not read it. */
export async function loadFaqGroup(reader: FaqReader, slug: string): Promise<FaqGroupDto | undefined> {
  const [group] = await loadFaqGroups(reader, { slugs: [slug] })
  return group
}

/** Items fetched per round trip of a search, and how many visible hits it answers. */
const SEARCH_BATCH = 200
const SEARCH_LIMIT = 50
/** A search gives up after this many batches (10 000 matching items) so one request cannot scan the table. */
const SEARCH_MAX_BATCHES = 50

/**
 * Published items whose question or answer contains `query` in any language, among the ones the reader may read, in the
 * order of the groups and items. The operation filter and the order are in SQL; the grants are not, so the matches are
 * read in batches until there are 50 readable hits or none are left.
 */
export async function searchFaq(reader: FaqReader, options: { query: string, operationId?: string }): Promise<FaqSearchResult[]> {
  const { query, operationId } = options
  const where = and(
    eq(schema.faqItems.status, 'published'),
    or(faqTranslatedContains(schema.faqItems.question, query), faqTranslatedContains(schema.faqItems.answer, query)),
    operationId ? and(eq(schema.faqGroups.ownerType, 'operation'), eq(schema.faqGroups.ownerId, operationId)) : undefined,
  )
  const hits: FaqSearchResult[] = []
  for (let batch = 0; batch < SEARCH_MAX_BATCHES && hits.length < SEARCH_LIMIT; batch++) {
    const rows = await db.select({ item: schema.faqItems, group: schema.faqGroups })
      .from(schema.faqItems)
      .innerJoin(schema.faqGroups, eq(schema.faqItems.groupId, schema.faqGroups.id))
      .where(where)
      .orderBy(asc(schema.faqGroups.sort), asc(schema.faqGroups.id), asc(schema.faqItems.sort), asc(schema.faqItems.id))
      .limit(SEARCH_BATCH)
      .offset(batch * SEARCH_BATCH)
    for (const { item, group } of rows) {
      if (hits.length < SEARCH_LIMIT && await faqCanReadItem(reader, group, item)) {
        hits.push({ group: { id: group.id, slug: group.slug, title: group.title }, item: toFaqItemDto(group, item) })
      }
    }
    if (rows.length < SEARCH_BATCH) break
  }
  return hits
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
 * 400 when the owner does not exist. `platform` has no id; every other type must be answered through
 * `teams:owner:resolve` (Teams answers `team` and `operation`, an app its own types). A type nobody answers cannot be
 * verified, so it is refused too.
 */
export async function assertFaqOwner(event: H3Event, owner: OwnerRef): Promise<void> {
  if (owner.type === 'platform') {
    if (owner.id) throw validationError([{ path: ['owner', 'id'], message: 'The platform owner has no id.' }])
    return
  }
  if (!owner.id) throw validationError([{ path: ['owner', 'id'], message: 'An owner of this type needs an id.' }])
  const ctx = { event, owner: { ...owner }, label: null, exists: null as boolean | null }
  await useNitroApp().hooks.callHook('teams:owner:resolve', ctx)
  if (ctx.exists !== true) {
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
  const grants = await grantsValidate(event, (input.grants ?? []) as Grant[])
  const [row] = await db.insert(schema.faqGroups).values({
    id: newId('faq'),
    slug: input.slug,
    title: input.title,
    description: input.description ?? null,
    icon: blankToNull(input.icon),
    ownerType: owner.type,
    ownerId: owner.id,
    grants,
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
  const grants = patch.grants ? await grantsValidate(event, patch.grants as Grant[], { stored: existing.grants }) : undefined
  const values: Partial<typeof schema.faqGroups.$inferInsert> = {}
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.title !== undefined) values.title = patch.title
  if (patch.description !== undefined) values.description = patch.description
  if (patch.icon !== undefined) values.icon = blankToNull(patch.icon)
  if (owner) {
    values.ownerType = owner.type
    values.ownerId = owner.id
  }
  if (grants) values.grants = grants
  if (patch.sort !== undefined) values.sort = patch.sort
  const changed: Partial<typeof schema.faqGroups.$inferInsert> = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !sameValue(value, existing[key as keyof FaqGroupRow])),
  )
  if (!Object.keys(changed).length) return existing
  const [row] = await db.update(schema.faqGroups).set(changed).where(eq(schema.faqGroups.id, existing.id)).returning().catch(rethrowSlugConflict)
  return row!
}

/**
 * Deletes a group; its items go with it through the foreign key (`onDelete: 'cascade'`), in the one statement, so there
 * is no half-deleted group. No transaction is used: NuxtHub's D1 driver has none, and `db.batch` is not allowed.
 */
export async function deleteFaqGroupRow(id: string): Promise<void> {
  await db.delete(schema.faqGroups).where(eq(schema.faqGroups.id, id))
}

/** `409 missing_translations` when the item lacks a required locale in its question or answer. */
export function assertFaqPublishable(item: Pick<FaqItemRow, 'question' | 'answer'>): void {
  const missing = missingTranslations(item, faqRequiredLocales())
  if (missing.length) throw apiError(409, 'missing_translations', describeMissingTranslations(missing), { missing })
}

/** Inserts a draft item at the end of the group. */
export async function createFaqItemRow(event: H3Event, group: FaqGroupRow, input: ItemInput, userId: string | number): Promise<FaqItemRow> {
  const grants = input.grants ? await grantsValidate(event, input.grants as Grant[]) : null
  const [row] = await db.insert(schema.faqItems).values({
    id: newId('fqi'),
    groupId: group.id,
    question: input.question,
    answer: input.answer,
    icon: blankToNull(input.icon),
    links: input.links?.length ? input.links : null,
    status: 'draft',
    grants,
    sort: await nextItemSort(group.id),
    updatedBy: String(userId),
  }).returning()
  return row!
}

/**
 * Applies a partial update to `existing`; returns the updated row (or `existing` when nothing changed). A published item
 * must keep every required locale, so an edit that removes one is `409 missing_translations`.
 */
export async function patchFaqItemRow(event: H3Event, existing: FaqItemRow, patch: ItemPatch, userId: string | number): Promise<FaqItemRow> {
  const grants = patch.grants ? await grantsValidate(event, patch.grants as Grant[], { stored: existing.grants }) : patch.grants
  const values: Partial<typeof schema.faqItems.$inferInsert> = {}
  if (patch.question !== undefined) values.question = patch.question
  if (patch.answer !== undefined) values.answer = patch.answer
  if (patch.icon !== undefined) values.icon = blankToNull(patch.icon)
  if (patch.links !== undefined) values.links = patch.links?.length ? patch.links : null
  if (grants !== undefined) values.grants = grants
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
  if (itemIds.length) {
    // One statement, so the order changes completely or not at all (no transaction: see `deleteFaqGroupRow`).
    const position = sql.join(itemIds.map((id, index) => sql`when ${schema.faqItems.id} = ${id} then cast(${index} as integer)`), sql` `)
    await db.update(schema.faqItems).set({ sort: sql`case ${position} end` })
      .where(and(eq(schema.faqItems.groupId, groupId), inArray(schema.faqItems.id, itemIds)))
  }
  return listFaqItemRows(groupId)
}
