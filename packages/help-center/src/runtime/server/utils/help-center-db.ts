import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, inArray, is, or, sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { isVisible, parseVisibility } from '@frigear-nu/audience'
import type { OwnerRef, Visibility } from '@frigear-nu/audience'
import { resolveOwner } from '@frigear-nu/audience/server'
import { apiError, conflict, escapeLike, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type { HelpCenterSource, HelpSourceCategory } from '../../../types'
import { describeMissingTranslations, DEFAULT_REQUIRED_LOCALES, missingTranslations } from '../../utils/publish'
import { isHelpArticleVisible, normalizeVisibility } from '../../utils/visibility'
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

// --- The database source ----------------------------------------------------------------------

/**
 * The `database` source: published articles of the tables, filtered by the viewer. The category's visibility and the
 * article's own are both checked (`isHelpArticleVisible`); the category filter and the search are in SQL, the viewer's
 * visibility is not, so rows are read in batches until there are enough visible ones or none are left.
 */
export const helpCenterDatabaseSource: HelpCenterSource = {
  id: 'database',
  readOnly: false,

  async categories({ viewer }) {
    const rows = await listHelpCategoryRows()
    return rows.map((row): HelpSourceCategory => ({ ...toHelpCategoryDto(row), visible: isVisible(parseVisibility(row.visibility), viewer) }))
  },

  async list({ viewer, q, category }) {
    const categories = (await listHelpCategoryRows()).filter(row => isVisible(parseVisibility(row.visibility), viewer))
    const byId = new Map(categories.map(row => [row.id, row]))
    const wanted = category ? categories.filter(row => row.slug === category) : categories
    if (!wanted.length) return []
    const where = and(
      eq(schema.helpArticles.status, 'published'),
      inArray(schema.helpArticles.categoryId, wanted.map(row => row.id)),
      q ? or(helpTranslatedContains(schema.helpArticles.title, q), helpTranslatedContains(schema.helpArticles.body, q)) : undefined,
    )
    const limit = q ? SEARCH_LIMIT : LIST_LIMIT
    const articles = []
    for (let batch = 0; batch < MAX_BATCHES && articles.length < limit; batch++) {
      const rows = await db.select().from(schema.helpArticles).where(where).orderBy(...ARTICLE_ORDER).limit(BATCH).offset(batch * BATCH)
      for (const row of rows) {
        const owner = byId.get(row.categoryId)
        if (owner && articles.length < limit && isHelpArticleVisible(owner, row, viewer)) articles.push(toHelpArticleDto(owner, row))
      }
      if (rows.length < BATCH) break
    }
    return articles
  },

  async get(slug, { viewer }) {
    return readable(await findHelpArticleBySlug(slug), viewer)
  },

  async getById(id, { viewer }) {
    if (!id.startsWith('hlp_')) return undefined
    return readable(await findHelpArticleById(id), viewer)
  },
}

async function readable(row: HelpArticleRow | undefined, viewer: Parameters<typeof isHelpArticleVisible>[2]) {
  if (!row || row.status !== 'published') return undefined
  const category = await findHelpCategoryById(row.categoryId)
  if (!category || !isHelpArticleVisible(category, row, viewer)) return undefined
  return toHelpArticleDto(category, row)
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

/**
 * 400 when the owner does not exist. `platform` has no id; every other type must be answered by its module through
 * `audience:owner:resolve` (operations answers for `operation`). A type nobody answers cannot be verified, so it is
 * refused too.
 */
export async function assertHelpOwner(event: H3Event, owner: OwnerRef): Promise<void> {
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

/**
 * 400 when an id names an operation that does not exist (through `audience:owner:resolve`, like an owner), unless it is
 * the one already stored: a record whose operation was deleted can still be edited.
 */
export async function assertHelpOperation(event: H3Event, operationId: string | null | undefined, stored: string | null | undefined, path: string[]): Promise<void> {
  if (!operationId || operationId === stored) return
  const resolved = await resolveOwner(event, { type: 'operation', id: operationId }, { hooks: useNitroApp().hooks })
  if (resolved.exists !== true) {
    throw validationError([{ path, message: 'This operation does not exist.' }], 'Unknown operation')
  }
}

/** The `operationId` of a visibility, checked with {@link assertHelpOperation}. */
export function assertHelpVisibilityOperation(event: H3Event, visibility: Visibility | null | undefined, stored?: unknown): Promise<void> {
  return assertHelpOperation(event, visibility?.operationId, parseVisibility(stored)?.operationId, ['visibility', 'operationId'])
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

/** Inserts a category after the slug, parent, owner and visibility checks. */
export async function createHelpCategoryRow(event: H3Event, input: CategoryInput): Promise<HelpCategoryRow> {
  await assertHelpCategorySlugFree(input.slug)
  await assertHelpParent(input.parentId)
  const owner = ownerValue(input.owner)
  await assertHelpOwner(event, owner)
  await assertHelpVisibilityOperation(event, input.visibility as Visibility | null | undefined)
  const [row] = await db.insert(schema.helpCategories).values({
    id: newRowId('hlc'),
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    parentId: input.parentId ?? null,
    ownerType: owner.type,
    ownerId: owner.id,
    visibility: normalizeVisibility(input.visibility as Visibility | null | undefined),
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
  if (patch.visibility) await assertHelpVisibilityOperation(event, patch.visibility as Visibility, existing.visibility)
  const values: Partial<typeof schema.helpCategories.$inferInsert> = {}
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.name !== undefined) values.name = patch.name
  if (patch.description !== undefined) values.description = patch.description
  if (patch.parentId !== undefined) values.parentId = patch.parentId ?? null
  if (owner) {
    values.ownerType = owner.type
    values.ownerId = owner.id
  }
  if (patch.visibility !== undefined) values.visibility = normalizeVisibility(patch.visibility as Visibility | null)
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
  await assertHelpVisibilityOperation(event, input.visibility as Visibility | null | undefined)
  const [row] = await db.insert(schema.helpArticles).values({
    id: newRowId('hlp'),
    categoryId: category.id,
    slug: input.slug,
    title: input.title,
    body: input.body,
    status: 'draft',
    visibility: normalizeVisibility(input.visibility as Visibility | null | undefined),
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
  if (patch.visibility) await assertHelpVisibilityOperation(event, patch.visibility as Visibility, existing.visibility)
  const values: Partial<typeof schema.helpArticles.$inferInsert> = {}
  if (patch.categoryId !== undefined) values.categoryId = patch.categoryId
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.title !== undefined) values.title = patch.title
  if (patch.body !== undefined) values.body = patch.body
  if (patch.visibility !== undefined) values.visibility = normalizeVisibility(patch.visibility as Visibility | null)
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

/** Every article row with its category slug, newest change first, for the admin list. Filters run in SQL. */
export async function listHelpArticleRows(options: { q?: string, status?: 'draft' | 'published', categorySlug?: string }) {
  const conditions: (SQL | undefined)[] = []
  if (options.status) conditions.push(eq(schema.helpArticles.status, options.status))
  if (options.categorySlug) conditions.push(eq(schema.helpCategories.slug, options.categorySlug))
  if (options.q) {
    conditions.push(or(
      helpTranslatedContains(schema.helpArticles.title, options.q),
      sql`lower(${schema.helpArticles.slug}) like ${`%${escapeLike(options.q.toLocaleLowerCase())}%`} escape '\\'`,
    ))
  }
  return db.select({ article: schema.helpArticles, category: schema.helpCategories })
    .from(schema.helpArticles)
    .innerJoin(schema.helpCategories, eq(schema.helpArticles.categoryId, schema.helpCategories.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.helpArticles.updatedAt), asc(schema.helpArticles.id))
    .limit(5000)
}
