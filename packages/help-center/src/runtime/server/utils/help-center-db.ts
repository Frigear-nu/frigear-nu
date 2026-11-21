import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, inArray, is, or, sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { chunkGrantParams } from '@frigear-nu/grants/core'
import type { Grant } from '@frigear-nu/grants/core'
import { apiError, conflict, escapeLike, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type { HelpCenterSource, HelpSourceCategory, OwnerRef } from '../../../types'
import { describeMissingTranslations, DEFAULT_REQUIRED_LOCALES, missingTranslations } from '../../utils/publish'
import { categoryChain, isHelpArticleReadableIn, isHelpChainReadable } from '../../utils/grants'
import type { HelpRecordReader } from '../../utils/grants'
import { toHelpArticleDto, toHelpCategoryDto } from './help-center-dto'
import type { HelpArticleRow, HelpCategoryRow } from './help-center-dto'
import { isHelpCenterForeignKeyViolation, isHelpCenterUniqueViolation } from './help-center-errors'
import type { helpArticleInput, helpArticlePatchSchema, helpCategoryInput, helpCategoryPatchSchema } from './help-center-schemas'

type CategoryInput = z.output<typeof helpCategoryInput>
type CategoryPatch = z.output<typeof helpCategoryPatchSchema>
type ArticleInput = z.output<typeof helpArticleInput>
type ArticlePatch = z.output<typeof helpArticlePatchSchema>

const PLATFORM: OwnerRef = { type: 'platform', id: null }
const newRowId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`

// --- Lookups --------------------------------------------------------------------------------

/** Every category, in their order. */
export async function listHelpCategoryRows(): Promise<HelpCategoryRow[]> {
  return db.select().from(schema.helpCategories)
    .orderBy(asc(schema.helpCategories.sort), asc(schema.helpCategories.createdAt), asc(schema.helpCategories.id))
}

export async function findHelpCategoryById(id: string): Promise<HelpCategoryRow | undefined> {
  const [row] = await db.select().from(schema.helpCategories).where(eq(schema.helpCategories.id, id)).limit(1)
  return row
}

export async function findHelpCategoryBySlug(slug: string): Promise<HelpCategoryRow | undefined> {
  const [row] = await db.select().from(schema.helpCategories).where(eq(schema.helpCategories.slug, slug)).limit(1)
  return row
}

/** The category with this id, or a 404. */
export async function getHelpCategoryOr404(id: string): Promise<HelpCategoryRow> {
  const row = await findHelpCategoryById(id)
  if (!row) throw notFound('Help category not found.')
  return row
}

export async function findHelpArticleById(id: string): Promise<HelpArticleRow | undefined> {
  const [row] = await db.select().from(schema.helpArticles).where(eq(schema.helpArticles.id, id)).limit(1)
  return row
}

export async function findHelpArticleBySlug(slug: string): Promise<HelpArticleRow | undefined> {
  const [row] = await db.select().from(schema.helpArticles).where(eq(schema.helpArticles.slug, slug)).limit(1)
  return row
}

/** The article with this id, or a 404. */
export async function getHelpArticleOr404(id: string): Promise<HelpArticleRow> {
  const row = await findHelpArticleById(id)
  if (!row) throw notFound('Help article not found.')
  return row
}

/** Article counts per category id. Categories with no articles are not in the map. */
export async function helpCategoryCounts(): Promise<Map<string, number>> {
  const rows = await db.select({ categoryId: schema.helpArticles.categoryId, total: count() })
    .from(schema.helpArticles).groupBy(schema.helpArticles.categoryId)
  return new Map(rows.map(row => [row.categoryId, Number(row.total)]))
}

/** The locales an article must have before it is published (the `requiredLocales` option). */
export function helpCenterRequiredLocales(): string[] {
  const configured = (useRuntimeConfig().public.helpCenter as { requiredLocales?: string[] } | undefined)?.requiredLocales
  return configured?.length ? configured : [...DEFAULT_REQUIRED_LOCALES]
}

// --- Search ---------------------------------------------------------------------------------

/**
 * Search of a translated json column (a plain string, or a locale -> text map) for `value` in any language, ignoring
 * case. Matches the texts only, never the locale keys. sqlite reads the json with `json_each` (a json string scalar
 * yields one row); postgresql with `jsonb_each_text`, wrapping a string scalar in an object first.
 *
 * The needle is folded in JavaScript with `toLocaleLowerCase()`, which knows Danish letters. postgresql then lowercases
 * the stored text too (`lower()`, aware of non-ASCII letters). sqlite's `lower()` and `LIKE` only fold ASCII, so there
 * the stored text is compared with the lowercase and the uppercase needle: `øl` finds `ØL` and `Øl`. A stored text that
 * mixes cases of non-ASCII letters differently from the needle can still be missed on sqlite.
 */
export function helpTranslatedContains(column: AnyColumn, value: string): SQL {
  const lower = `%${escapeLike(value.toLocaleLowerCase())}%`
  const upper = `%${escapeLike(value.toLocaleUpperCase())}%`
  if (is(schema.helpArticles, PgTable)) {
    return sql`exists (select 1 from jsonb_each_text(case when jsonb_typeof(${column}) = 'object' then ${column} else jsonb_build_object('_', ${column}) end) as t where lower(t.value) like ${lower} escape '\\')`
  }
  return sql`exists (select 1 from json_each(${column}) as t where t.value like ${lower} escape '\\' or t.value like ${upper} escape '\\')`
}

/** Rows fetched per round trip of a read, and how many visible articles a search or a list answers. */
const BATCH = 200
const SEARCH_LIMIT = 50
const LIST_LIMIT = 1000
/** A search gives up after this many batches (10 000 rows) so one request cannot scan the table. */
const MAX_BATCHES = 50

const ARTICLE_ORDER = [asc(schema.helpArticles.sort), asc(schema.helpArticles.createdAt), asc(schema.helpArticles.id)] as const

// --- Per-request cache ------------------------------------------------------------------------

type RequestCache = {
  categories?: Promise<HelpCategoryRow[]>
  articlesById: Map<string, Promise<HelpArticleRow | undefined>>
  articlesBySlug: Map<string, Promise<HelpArticleRow | undefined>>
}

/** Rows read for one request, so a send or a checklist reads each article and the category tree once, not once per person. */
function requestCache(event: H3Event): RequestCache {
  return (event.context.helpCenterCache ??= { articlesById: new Map(), articlesBySlug: new Map() }) as RequestCache
}

/** Every category, read once per request. Not for the admin routes: they write, and must see their own changes. */
export function cachedHelpCategoryRows(event: H3Event): Promise<HelpCategoryRow[]> {
  const cache = requestCache(event)
  return cache.categories ??= listHelpCategoryRows()
}

function cachedArticleBy(event: H3Event, kind: 'articlesById' | 'articlesBySlug', key: string, find: (key: string) => Promise<HelpArticleRow | undefined>) {
  const map = requestCache(event)[kind]
  let found = map.get(key)
  if (!found) map.set(key, found = find(key))
  return found
}

/** A category tree held in memory: ancestors are looked up without another query. */
function categoryTree(rows: HelpCategoryRow[]) {
  const byId = new Map(rows.map(row => [row.id, row]))
  return { byId, chainOf: (row: HelpCategoryRow) => categoryChain(row, byId) }
}

// --- The database source ----------------------------------------------------------------------

/**
 * The `database` source: published articles of the tables, filtered by the reader. A category is readable only when it
 * and every ancestor are, and an article when its whole chain is and its own grants admit too (`isHelpArticleReadableIn`);
 * the category filter and the search are in SQL, the grants are not, so rows are read in batches until there are enough
 * readable ones or none are left.
 */
export const helpCenterDatabaseSource: HelpCenterSource = {
  id: 'database',
  readOnly: false,

  async categories({ event, reader }) {
    const tree = categoryTree(await cachedHelpCategoryRows(event))
    return Promise.all([...tree.byId.values()].map(async (row): Promise<HelpSourceCategory> => {
      const chain = tree.chainOf(row)
      return { ...toHelpCategoryDto(row, chain), visible: await isHelpChainReadable(chain, reader.canRead) }
    }))
  },

  async list({ event, reader, q, category }) {
    const tree = categoryTree(await cachedHelpCategoryRows(event))
    const categories: HelpCategoryRow[] = []
    for (const row of tree.byId.values()) if (await isHelpChainReadable(tree.chainOf(row), reader.canRead)) categories.push(row)
    const wanted = category ? categories.filter(row => row.slug === category) : categories
    if (!wanted.length) return []
    const where = and(
      eq(schema.helpArticles.status, 'published'),
      helpInChunks(schema.helpArticles.categoryId, wanted.map(row => row.id)),
      q ? or(helpTranslatedContains(schema.helpArticles.title, q), helpTranslatedContains(schema.helpArticles.body, q)) : undefined,
    )
    const limit = q ? SEARCH_LIMIT : LIST_LIMIT
    const articles = []
    let exhausted = false
    for (let batch = 0; batch < MAX_BATCHES && articles.length < limit; batch++) {
      const rows = await db.select().from(schema.helpArticles).where(where).orderBy(...ARTICLE_ORDER).limit(BATCH).offset(batch * BATCH)
      for (const row of rows) {
        const owner = tree.byId.get(row.categoryId)
        if (!owner || articles.length >= limit) continue
        const chain = tree.chainOf(owner)
        if (await isHelpArticleReadableIn(chain, row, reader.canRead)) articles.push(toHelpArticleDto(owner, row, chain))
      }
      if (rows.length < BATCH) {
        exhausted = true
        break
      }
    }
    // A cut is by design (50 hits for a search, 1000 articles for a list); say so in the log instead of cutting silently.
    if (!exhausted && !q && articles.length >= limit) console.warn(`[@frigear-nu/help-center] the article list is cut at ${LIST_LIMIT} articles.`)
    if (!exhausted && articles.length < limit) console.warn(`[@frigear-nu/help-center] a read stopped after ${MAX_BATCHES * BATCH} rows without finding enough readable articles.`)
    return articles
  },

  async get(slug, { event, reader }) {
    return readable(event, await cachedArticleBy(event, 'articlesBySlug', slug, findHelpArticleBySlug), reader.canRead)
  },

  async getById(id, { event, reader }) {
    if (!id.startsWith('hlp_')) return undefined
    return readable(event, await cachedArticleBy(event, 'articlesById', id, findHelpArticleById), reader.canRead)
  },
}

async function readable(event: H3Event, row: HelpArticleRow | undefined, canRead: HelpRecordReader) {
  if (!row || row.status !== 'published') return undefined
  const tree = categoryTree(await cachedHelpCategoryRows(event))
  const category = tree.byId.get(row.categoryId)
  if (!category) return undefined
  const chain = tree.chainOf(category)
  if (!(await isHelpArticleReadableIn(chain, row, canRead))) return undefined
  return toHelpArticleDto(category, row, chain)
}

// --- Writing ---------------------------------------------------------------------------------

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** `409 conflict` when another category already uses `slug`. */
export async function assertHelpCategorySlugFree(slug: string, exceptId?: string): Promise<void> {
  const taken = await findHelpCategoryBySlug(slug)
  if (taken && taken.id !== exceptId) throw conflict('A help category with this slug already exists.', { field: 'slug' })
}

/** `409 conflict` when another article already uses `slug`. */
export async function assertHelpArticleSlugFree(slug: string, exceptId?: string): Promise<void> {
  const taken = await findHelpArticleBySlug(slug)
  if (taken && taken.id !== exceptId) throw conflict('A help article with this slug already exists.', { field: 'slug' })
}

/** Two requests can pass the slug pre-check together: the unique index decides, and the loser gets the same 409. */
const rethrowSlugConflict = (what: string) => (error: unknown): never => {
  if (isHelpCenterUniqueViolation(error)) throw conflict(`A help ${what} with this slug already exists.`, { field: 'slug' })
  throw error
}

/** An owner, as Teams' `teams:owner:resolve` answers it. */
async function resolveHelpOwner(event: H3Event, owner: OwnerRef): Promise<boolean | null> {
  const ctx = { event, owner: { ...owner }, label: null, exists: null as boolean | null }
  await useNitroApp().hooks.callHook('teams:owner:resolve', ctx)
  return ctx.exists
}

/**
 * 400 when the owner does not exist. `platform` has no id; every other type must be answered through
 * `teams:owner:resolve` (Teams answers `team` and `operation`, an app its own types). A type nobody answers cannot be
 * verified, so it is refused too.
 */
export async function assertHelpOwner(event: H3Event, owner: OwnerRef): Promise<void> {
  if (owner.type === 'platform') {
    if (owner.id) throw validationError([{ path: ['owner', 'id'], message: 'The platform owner has no id.' }])
    return
  }
  if (!owner.id) throw validationError([{ path: ['owner', 'id'], message: 'An owner of this type needs an id.' }])
  if (await resolveHelpOwner(event, owner) !== true) {
    throw validationError([{ path: ['owner'], message: 'This owner does not exist.' }], 'Unknown owner')
  }
}

/**
 * 400 when an id names an operation that does not exist (through `teams:owner:resolve`, like an owner), unless it is the
 * one already stored: a record whose operation was deleted can still be edited.
 */
export async function assertHelpOperation(event: H3Event, operationId: string | null | undefined, stored: string | null | undefined, path: string[]): Promise<void> {
  if (!operationId || operationId === stored) return
  if (await resolveHelpOwner(event, { type: 'operation', id: operationId }) !== true) {
    throw validationError([{ path, message: 'This operation does not exist.' }], 'Unknown operation')
  }
}

/** `column IN (...)` cut into chunks under D1's bound parameter limit, joined with `or`. */
export function helpInChunks(column: AnyColumn, values: string[]): SQL | undefined {
  return or(...chunkGrantParams(values).map(chunk => inArray(column, chunk)))
}

/** The parent must exist, not be the category itself and not be one of its descendants. */
async function assertHelpParent(parentId: string | null | undefined, categoryId?: string): Promise<void> {
  if (!parentId) return
  if (categoryId && parentId === categoryId) throw validationError([{ path: ['parentId'], message: 'A category cannot be its own parent.' }])
  const rows = await listHelpCategoryRows()
  const byId = new Map(rows.map(row => [row.id, row]))
  if (!byId.has(parentId)) throw validationError([{ path: ['parentId'], message: 'This parent category does not exist.' }])
  for (let cursor = byId.get(parentId), depth = 0; cursor && depth < 50; cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined, depth++) {
    if (categoryId && cursor.id === categoryId) throw validationError([{ path: ['parentId'], message: 'A category cannot sit below one of its own subcategories.' }])
  }
}

const ownerValue = (owner: { type: string, id?: string | null } | undefined): OwnerRef =>
  owner ? { type: owner.type, id: owner.id ?? null } : PLATFORM

async function nextCategorySort(): Promise<number> {
  const [row] = await db.select({ max: sql<number | null>`max(${schema.helpCategories.sort})` }).from(schema.helpCategories)
  return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1
}

async function nextArticleSort(categoryId: string): Promise<number> {
  const [row] = await db.select({ max: sql<number | null>`max(${schema.helpArticles.sort})` }).from(schema.helpArticles).where(eq(schema.helpArticles.categoryId, categoryId))
  return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1
}

const faqGroupsValue = (groups: string[] | null | undefined) => groups?.length ? [...new Set(groups)] : null

/** Inserts a category after the slug, parent, owner and grants checks. */
export async function createHelpCategoryRow(event: H3Event, input: CategoryInput): Promise<HelpCategoryRow> {
  await assertHelpCategorySlugFree(input.slug)
  await assertHelpParent(input.parentId)
  const owner = ownerValue(input.owner)
  await assertHelpOwner(event, owner)
  const grants = await grantsValidate(event, (input.grants ?? []) as Grant[])
  const [row] = await db.insert(schema.helpCategories).values({
    id: newRowId('hlc'),
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    parentId: input.parentId ?? null,
    ownerType: owner.type,
    ownerId: owner.id,
    grants,
    faqGroups: faqGroupsValue(input.faqGroups),
    sort: input.sort ?? await nextCategorySort(),
  }).returning().catch(rethrowSlugConflict('category'))
  return row!
}

/** Applies a partial update to `existing`; returns the updated row (or `existing` when nothing changed). */
export async function patchHelpCategoryRow(event: H3Event, existing: HelpCategoryRow, patch: CategoryPatch): Promise<HelpCategoryRow> {
  if (patch.slug) await assertHelpCategorySlugFree(patch.slug, existing.id)
  if (patch.parentId !== undefined && patch.parentId !== existing.parentId) await assertHelpParent(patch.parentId, existing.id)
  const owner = patch.owner ? ownerValue(patch.owner) : undefined
  // An unchanged owner is not checked again: a category whose operation was deleted can still be edited.
  if (owner && !(owner.type === existing.ownerType && owner.id === (existing.ownerId ?? null))) await assertHelpOwner(event, owner)
  const grants = patch.grants ? await grantsValidate(event, patch.grants as Grant[], { stored: existing.grants }) : undefined
  const values: Partial<typeof schema.helpCategories.$inferInsert> = {}
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.name !== undefined) values.name = patch.name
  if (patch.description !== undefined) values.description = patch.description
  if (patch.parentId !== undefined) values.parentId = patch.parentId ?? null
  if (owner) {
    values.ownerType = owner.type
    values.ownerId = owner.id
  }
  if (grants) values.grants = grants
  if (patch.faqGroups !== undefined) values.faqGroups = faqGroupsValue(patch.faqGroups)
  if (patch.sort !== undefined) values.sort = patch.sort
  const changed: Partial<typeof schema.helpCategories.$inferInsert> = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !sameValue(value, existing[key as keyof HelpCategoryRow])),
  )
  if (!Object.keys(changed).length) return existing
  const [row] = await db.update(schema.helpCategories).set(changed).where(eq(schema.helpCategories.id, existing.id)).returning().catch(rethrowSlugConflict('category'))
  return row!
}

/**
 * Deletes a category that has no articles: `409 category_not_empty` otherwise (move or delete them first). Its
 * subcategories move up to its parent. No transaction is used: NuxtHub's D1 driver has none, and `db.batch` is not allowed.
 */
export async function deleteHelpCategoryRow(existing: HelpCategoryRow): Promise<void> {
  const [row] = await db.select({ total: count() }).from(schema.helpArticles).where(eq(schema.helpArticles.categoryId, existing.id))
  if (Number(row?.total ?? 0) > 0) {
    throw apiError(409, 'category_not_empty', 'The category still has articles. Move or delete them first.', { articleCount: Number(row!.total) })
  }
  await db.update(schema.helpCategories).set({ parentId: existing.parentId ?? null }).where(eq(schema.helpCategories.parentId, existing.id))
  await db.delete(schema.helpCategories).where(eq(schema.helpCategories.id, existing.id)).catch((error) => {
    if (isHelpCenterForeignKeyViolation(error)) throw apiError(409, 'category_not_empty', 'The category still has articles. Move or delete them first.')
    throw error
  })
}

/** `409 missing_translations` when the article lacks a required locale in its title or body. */
export function assertHelpArticlePublishable(article: Pick<HelpArticleRow, 'title' | 'body'>): void {
  const missing = missingTranslations(article, helpCenterRequiredLocales())
  if (missing.length) throw apiError(409, 'missing_translations', describeMissingTranslations(missing), { missing })
}

/** The category an article is filed in, or a 400. */
async function requireHelpCategory(id: string): Promise<HelpCategoryRow> {
  const category = await findHelpCategoryById(id)
  if (!category) throw validationError([{ path: ['categoryId'], message: 'This category does not exist.' }], 'Unknown category')
  return category
}

/** Inserts a draft article at the end of its category. */
export async function createHelpArticleRow(event: H3Event, input: ArticleInput, userId: string | number): Promise<HelpArticleRow> {
  await assertHelpArticleSlugFree(input.slug)
  const category = await requireHelpCategory(input.categoryId)
  const grants = input.grants ? await grantsValidate(event, input.grants as Grant[]) : null
  const [row] = await db.insert(schema.helpArticles).values({
    id: newRowId('hlp'),
    categoryId: category.id,
    slug: input.slug,
    title: input.title,
    body: input.body,
    status: 'draft',
    grants,
    sort: input.sort ?? await nextArticleSort(category.id),
    updatedBy: String(userId),
  }).returning().catch(rethrowSlugConflict('article'))
  return row!
}

/**
 * Applies a partial update to `existing`; returns the updated row (or `existing` when nothing changed). A published
 * article must keep every required locale, so an edit that removes one is `409 missing_translations`.
 */
export async function patchHelpArticleRow(event: H3Event, existing: HelpArticleRow, patch: ArticlePatch, userId: string | number): Promise<HelpArticleRow> {
  if (patch.slug) await assertHelpArticleSlugFree(patch.slug, existing.id)
  if (patch.categoryId && patch.categoryId !== existing.categoryId) await requireHelpCategory(patch.categoryId)
  const grants = patch.grants ? await grantsValidate(event, patch.grants as Grant[], { stored: existing.grants }) : patch.grants
  const values: Partial<typeof schema.helpArticles.$inferInsert> = {}
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.title !== undefined) values.title = patch.title
  if (patch.body !== undefined) values.body = patch.body
  if (grants !== undefined) values.grants = grants
  if (patch.sort !== undefined) values.sort = patch.sort
  const changed: Partial<typeof schema.helpArticles.$inferInsert> = Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !sameValue(value, existing[key as keyof HelpArticleRow])),
  )
  if (!Object.keys(changed).length) return existing
  if (existing.status === 'published') assertHelpArticlePublishable({ title: changed.title ?? existing.title, body: changed.body ?? existing.body })
  const [row] = await db.update(schema.helpArticles).set({ ...changed, updatedBy: String(userId) }).where(eq(schema.helpArticles.id, existing.id)).returning().catch(rethrowSlugConflict('article'))
  return row!
}

/** Moves an article to `status`, recording who did it. Conditional on the status read, so two staff members cannot both win. */
export async function setHelpArticleStatus(existing: HelpArticleRow, status: 'draft' | 'published', userId: string | number): Promise<HelpArticleRow | undefined> {
  const [row] = await db.update(schema.helpArticles)
    .set({ status, updatedBy: String(userId), ...(status === 'published' ? { publishedAt: new Date() } : {}) })
    .where(and(eq(schema.helpArticles.id, existing.id), eq(schema.helpArticles.status, existing.status))).returning()
  return row
}

/** Deletes an article, the reads of it and its places in checklists. */
export async function deleteHelpArticleRow(existing: HelpArticleRow): Promise<void> {
  await db.delete(schema.helpChecklistItems).where(eq(schema.helpChecklistItems.articleId, existing.id))
  await db.delete(schema.helpReads).where(eq(schema.helpReads.articleId, existing.id))
  await db.delete(schema.helpArticles).where(eq(schema.helpArticles.id, existing.id))
}

type AdminArticleFilter = { q?: string, status?: 'draft' | 'published', categorySlug?: string }

function adminArticleWhere(options: AdminArticleFilter) {
  const conditions: (SQL | undefined)[] = []
  if (options.status) conditions.push(eq(schema.helpArticles.status, options.status))
  if (options.categorySlug) conditions.push(eq(schema.helpCategories.slug, options.categorySlug))
  if (options.q) {
    conditions.push(or(
      helpTranslatedContains(schema.helpArticles.title, options.q),
      sql`lower(${schema.helpArticles.slug}) like ${`%${escapeLike(options.q.toLocaleLowerCase())}%`} escape '\\'`,
    ))
  }
  return conditions.length ? and(...conditions) : undefined
}

/** The most article rows the admin list sorts and pages in memory. `countHelpArticleRows` still counts them all. */
export const HELP_ADMIN_ARTICLE_CAP = 5000

/** The newest article rows with their category, for the admin list. Filters run in SQL; at most {@link HELP_ADMIN_ARTICLE_CAP}. */
export async function listHelpArticleRows(options: AdminArticleFilter) {
  return db.select({ article: schema.helpArticles, category: schema.helpCategories })
    .from(schema.helpArticles)
    .innerJoin(schema.helpCategories, eq(schema.helpArticles.categoryId, schema.helpCategories.id))
    .where(adminArticleWhere(options))
    .orderBy(desc(schema.helpArticles.updatedAt), asc(schema.helpArticles.id))
    .limit(HELP_ADMIN_ARTICLE_CAP)
}

/** How many articles match, whatever the cap of the list: the `total` of the admin page. */
export async function countHelpArticleRows(options: AdminArticleFilter): Promise<number> {
  const [row] = await db.select({ total: count() })
    .from(schema.helpArticles)
    .innerJoin(schema.helpCategories, eq(schema.helpArticles.categoryId, schema.helpCategories.id))
    .where(adminArticleWhere(options))
  return Number(row?.total ?? 0)
}
