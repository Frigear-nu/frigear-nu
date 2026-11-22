import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { readGrants } from '@frigear-nu/auth/grants'
import type { Grant } from '@frigear-nu/auth/grants'
import { isoDate, notFound, paginate, validationError } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type {
  AdminHelpChecklistDto,
  AdminHelpChecklistItemDto,
  HelpArticleSummaryDto,
  HelpChecklistDto,
  HelpChecklistItemDto,
  HelpProgressRow,
  HelpProgressSummary,
} from '../../../types'
import { helpCenterArticleById, helpCenterRequest } from './help-center'
import type { HelpCenterRequest } from './help-center'
import { helpCenterContentArticles } from './help-center-content'
import { assertHelpOperation } from './help-center-db'
import { toHelpArticleSummaryDto, toHelpArticleSummary } from './help-center-dto'
import type { helpChecklistInput, helpChecklistPatchSchema } from './help-center-schemas'

export type HelpChecklistRow = typeof schema.helpChecklists.$inferSelect
export type HelpChecklistItemRow = typeof schema.helpChecklistItems.$inferSelect
type ChecklistInput = z.output<typeof helpChecklistInput>
type ChecklistPatch = z.output<typeof helpChecklistPatchSchema>

const newRowId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`

/** Rows bound per statement: stays under the 100 bound parameters of one D1 statement. */
const CHUNK = 50

function chunked<T>(values: readonly T[], size = CHUNK): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

// --- Lookups --------------------------------------------------------------------------------

export async function listHelpChecklistRows(): Promise<HelpChecklistRow[]> {
  return db.select().from(schema.helpChecklists)
    .orderBy(asc(schema.helpChecklists.sort), asc(schema.helpChecklists.createdAt), asc(schema.helpChecklists.id))
}

export async function getHelpChecklistOr404(id: string): Promise<HelpChecklistRow> {
  const [row] = await db.select().from(schema.helpChecklists).where(eq(schema.helpChecklists.id, id)).limit(1)
  if (!row) throw notFound('Help checklist not found.')
  return row
}

async function itemRowsOf(checklistIds: string[]): Promise<HelpChecklistItemRow[]> {
  const rows: HelpChecklistItemRow[] = []
  for (const ids of chunked(checklistIds)) {
    rows.push(...await db.select().from(schema.helpChecklistItems).where(inArray(schema.helpChecklistItems.checklistId, ids)))
  }
  return rows.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
}

type EffectiveItem = { id: string | null, articleId: string, required: boolean, sort: number, fromContent: boolean }

/**
 * The items of a checklist: the ones of the builder, then the content articles whose `checklist` frontmatter names the
 * checklist (required, in their own order) that the builder does not list already.
 */
function effectiveItems(
  checklistId: string,
  rows: HelpChecklistItemRow[],
  contentArticles: Array<{ id: string, order: number, checklists: string[] }>,
): EffectiveItem[] {
  const own = rows.filter(row => row.checklistId === checklistId)
  const known = new Set(own.map(row => row.articleId))
  const last = own.reduce((max, row) => Math.max(max, row.sort), -1)
  return [
    ...own.map(row => ({ id: row.id, articleId: row.articleId, required: row.required, sort: row.sort, fromContent: false })),
    ...contentArticles
      .filter(article => article.checklists.includes(checklistId) && !known.has(article.id))
      .sort((a, b) => a.order - b.order)
      .map((article, index) => ({ id: null, articleId: article.id, required: true, sort: last + 1 + index, fromContent: true })),
  ]
}

// --- Reads ---------------------------------------------------------------------------------

/** Marks an article read by a user. Reading twice keeps the first time. Resolves with when it was first read. */
export async function markHelpArticleRead(userId: string | number, articleId: string): Promise<{ articleId: string, readAt: string }> {
  const user = String(userId)
  const find = async () => (await db.select().from(schema.helpReads)
    .where(and(eq(schema.helpReads.userId, user), eq(schema.helpReads.articleId, articleId))).limit(1))[0]
  let row = await find()
  if (!row) {
    // Two requests can insert together: the unique pair decides, and the loser reads the winner's row.
    await db.insert(schema.helpReads).values({ id: newRowId('hlr'), userId: user, articleId }).onConflictDoNothing()
    row = await find()
  }
  return { articleId, readAt: isoDate(row!.readAt) }
}

async function readTimes(userId: string, articleIds: string[]): Promise<Map<string, Date>> {
  const reads = new Map<string, Date>()
  for (const ids of chunked(articleIds)) {
    const rows = await db.select().from(schema.helpReads).where(and(eq(schema.helpReads.userId, userId), inArray(schema.helpReads.articleId, ids)))
    for (const row of rows) reads.set(row.articleId, row.readAt)
  }
  return reads
}

/**
 * Whether the reader may see a checklist: its grants admit them, and when it is for an operation, they take part in it
 * (the `operation` grant kind; without `@frigear-nu/operations` nobody does).
 */
async function checklistVisible(row: HelpChecklistRow, ctx: HelpCenterRequest): Promise<boolean> {
  if (!ctx.user || !(await ctx.reader.canRead(row))) return false
  return !row.operationId || grantsMatch(ctx.event, ctx.user, [{ kind: 'operation', operationId: row.operationId }])
}

/**
 * The checklists a signed-in reader sees, each with the articles in it they may read (the others are left out, as if
 * not there) and which of them they have read. A checklist with nothing readable is left out. Anonymous callers get none.
 */
export async function loadViewerChecklists(ctx: HelpCenterRequest): Promise<HelpChecklistDto[]> {
  if (!ctx.user) return []
  const checklists: HelpChecklistRow[] = []
  for (const row of await listHelpChecklistRows()) if (await checklistVisible(row, ctx)) checklists.push(row)
  if (!checklists.length) return []
  const itemRows = await itemRowsOf(checklists.map(row => row.id))
  const contentArticles = await helpCenterContentArticles(ctx.event)

  const articles = new Map<string, HelpArticleSummaryDto | undefined>()
  const items = new Map(checklists.map(row => [row.id, effectiveItems(row.id, itemRows, contentArticles)]))
  const wanted = [...new Set([...items.values()].flatMap(list => list.map(item => item.articleId)))]
  await Promise.all(wanted.map(async (id) => {
    const article = await helpCenterArticleById(ctx, id)
    articles.set(id, article ? toHelpArticleSummary(article) : undefined)
  }))
  const reads = await readTimes(String(ctx.user.id), wanted)

  const result: HelpChecklistDto[] = []
  for (const row of checklists) {
    const list: HelpChecklistItemDto[] = []
    for (const item of items.get(row.id) ?? []) {
      const article = articles.get(item.articleId)
      if (!article) continue
      const readAt = reads.get(item.articleId)
      list.push({ articleId: item.articleId, required: item.required, read: !!readAt, readAt: readAt ? isoDate(readAt) : null, article })
    }
    if (!list.length) continue
    const required = list.filter(item => item.required)
    const requiredReadCount = required.filter(item => item.read).length
    result.push({
      id: row.id,
      name: row.name,
      operationId: row.operationId ?? null,
      items: list,
      readCount: list.filter(item => item.read).length,
      requiredCount: required.length,
      requiredReadCount,
      completed: requiredReadCount === required.length,
    })
  }
  return result
}

// --- Staff: reading --------------------------------------------------------------------------

/** Summaries of articles by id for staff, whatever their status: database rows and content articles. */
async function adminArticleSummaries(event: H3Event, ids: string[]): Promise<Map<string, HelpArticleSummaryDto>> {
  const summaries = new Map<string, HelpArticleSummaryDto>()
  const databaseIds = ids.filter(id => id.startsWith('hlp_'))
  for (const part of chunked(databaseIds)) {
    const rows = await db.select({ article: schema.helpArticles, category: schema.helpCategories })
      .from(schema.helpArticles)
      .innerJoin(schema.helpCategories, eq(schema.helpArticles.categoryId, schema.helpCategories.id))
      .where(inArray(schema.helpArticles.id, part))
    for (const { article, category } of rows) summaries.set(article.id, toHelpArticleSummaryDto(category, article))
  }
  // The other sources (Nuxt Content, a host's own) serve public articles: read them as a visitor, each id once.
  const others = [...new Set(ids.filter(id => !id.startsWith('hlp_')))]
  if (others.length) {
    const ctx = await helpCenterRequest(event, { public: true })
    await Promise.all(others.map(async (id) => {
      const article = await helpCenterArticleById(ctx, id)
      if (article) summaries.set(id, toHelpArticleSummary(article))
    }))
  }
  return summaries
}

/** The staff view of checklists: every item, with its article when it still exists. */
export async function toAdminHelpChecklistDtos(event: H3Event, rows: HelpChecklistRow[]): Promise<AdminHelpChecklistDto[]> {
  if (!rows.length) return []
  const itemRows = await itemRowsOf(rows.map(row => row.id))
  const contentArticles = await helpCenterContentArticles(event)
  const lists = new Map(rows.map(row => [row.id, effectiveItems(row.id, itemRows, contentArticles)]))
  const summaries = await adminArticleSummaries(event, [...new Set([...lists.values()].flatMap(list => list.map(item => item.articleId)))])
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    operationId: row.operationId ?? null,
    grants: readGrants(row.grants),
    sort: row.sort,
    items: (lists.get(row.id) ?? []).map((item): AdminHelpChecklistItemDto => ({
      id: item.id ?? `content:${item.articleId}`,
      articleId: item.articleId,
      required: item.required,
      sort: item.sort,
      article: summaries.get(item.articleId) ?? null,
      fromContent: item.fromContent,
    })),
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }))
}

export async function toAdminHelpChecklistDto(event: H3Event, row: HelpChecklistRow): Promise<AdminHelpChecklistDto> {
  return (await toAdminHelpChecklistDtos(event, [row]))[0]!
}

// --- Staff: writing --------------------------------------------------------------------------

/** 400 naming the first item that points at an article that does not exist, or that is listed twice. */
async function assertChecklistItems(event: H3Event, items: NonNullable<ChecklistInput['items']>): Promise<void> {
  const ids = items.map(item => item.articleId)
  const duplicate = ids.findIndex((id, index) => ids.indexOf(id) !== index)
  if (duplicate !== -1) throw validationError([{ path: ['items', duplicate, 'articleId'], message: 'An article can only be on a checklist once.' }])
  const found = await adminArticleSummaries(event, ids)
  const missing = ids.findIndex(id => !found.has(id))
  if (missing !== -1) throw validationError([{ path: ['items', missing, 'articleId'], message: 'This article does not exist.' }], 'Unknown article')
}

async function replaceChecklistItems(checklistId: string, items: NonNullable<ChecklistInput['items']>): Promise<void> {
  await db.delete(schema.helpChecklistItems).where(eq(schema.helpChecklistItems.checklistId, checklistId))
  const values = items.map((item, index) => ({ id: newRowId('hci'), checklistId, articleId: item.articleId, sort: index, required: item.required ?? true }))
  // A few rows per statement: one insert of many rows would pass D1's bound parameter limit.
  for (const part of chunked(values, 10)) await db.insert(schema.helpChecklistItems).values(part)
}

export async function createHelpChecklistRow(event: H3Event, input: ChecklistInput): Promise<HelpChecklistRow> {
  await assertHelpOperation(event, input.operationId, undefined, ['operationId'])
  const grants = await grantsValidate(event, (input.grants ?? []) as Grant[])
  if (input.items) await assertChecklistItems(event, input.items)
  const [row] = await db.insert(schema.helpChecklists).values({
    id: newRowId('hck'),
    operationId: input.operationId ?? null,
    name: input.name,
    grants,
    sort: input.sort ?? (await listHelpChecklistRows()).length,
  }).returning()
  if (input.items?.length) await replaceChecklistItems(row!.id, input.items)
  return row!
}

/** Applies a partial update; `items`, when given, replaces the whole list. */
export async function patchHelpChecklistRow(event: H3Event, existing: HelpChecklistRow, patch: ChecklistPatch): Promise<HelpChecklistRow> {
  if (patch.operationId !== undefined) await assertHelpOperation(event, patch.operationId, existing.operationId, ['operationId'])
  const grants = patch.grants ? await grantsValidate(event, patch.grants as Grant[], { stored: existing.grants }) : undefined
  if (patch.items) await assertChecklistItems(event, patch.items)
  const values: Partial<typeof schema.helpChecklists.$inferInsert> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.operationId !== undefined) values.operationId = patch.operationId ?? null
  if (grants) values.grants = grants
  if (patch.sort !== undefined) values.sort = patch.sort
  let row = existing
  if (Object.keys(values).length) {
    const [updated] = await db.update(schema.helpChecklists).set(values).where(eq(schema.helpChecklists.id, existing.id)).returning()
    row = updated ?? existing
  }
  if (patch.items) {
    await replaceChecklistItems(existing.id, patch.items)
    if (row === existing) {
      const [touched] = await db.update(schema.helpChecklists).set({ sort: existing.sort }).where(eq(schema.helpChecklists.id, existing.id)).returning()
      row = touched ?? existing
    }
  }
  return row
}

export async function deleteHelpChecklistRow(id: string): Promise<void> {
  await db.delete(schema.helpChecklists).where(eq(schema.helpChecklists.id, id))
}

// --- Staff: progress -------------------------------------------------------------------------

type UsersTable = { id: AnyColumn, name: AnyColumn, email: AnyColumn, phone?: AnyColumn }

/** The `users` table of `@frigear-nu/users`, when the host has it (a package must not import it). */
const usersTable = () => (schema as unknown as { users?: UsersTable }).users

/** `user` is the row as stored (`id` as the table has it, a number for the users module), what auth's role lookup takes. */
export type HelpUserRecord = { id: string, name: string | null, email: string | null, phone: string | null, user: { id: string | number, name: string | null, email: string | null } }

/** People by id: name and email, and the phone when the host's users table has a `phone` column. */
export async function loadHelpUsers(ids: string[]): Promise<Map<string, HelpUserRecord>> {
  const table = usersTable()
  const people = new Map<string, HelpUserRecord>()
  if (!table || !ids.length) return people
  const numeric = [...new Set(ids)].map(Number).filter(Number.isFinite)
  for (const part of chunked(numeric)) {
    const fields: Record<string, AnyColumn> = { id: table.id, name: table.name, email: table.email }
    if (table.phone) fields.phone = table.phone
    const rows = await db.select(fields as never).from(table as never).where(inArray(table.id, part)) as unknown as Array<Record<string, unknown>>
    for (const row of rows) {
      const id = String(row.id)
      people.set(id, {
        id,
        name: typeof row.name === 'string' ? row.name : null,
        email: typeof row.email === 'string' ? row.email : null,
        phone: typeof row.phone === 'string' && row.phone ? row.phone : null,
        user: {
          id: row.id as string | number,
          name: typeof row.name === 'string' ? row.name : null,
          email: typeof row.email === 'string' ? row.email : null,
        },
      })
    }
  }
  return people
}

export type HelpProgressQuery = { page: number, pageSize: number, q?: string, sort: 'name' | 'readCount' | 'lastReadAt', order: 'asc' | 'desc' }

/**
 * Who read what on a checklist: every person who read one of its articles, plus the people the checklist's operation
 * takes part in (the members of its `operation` grant, so someone who has not started shows with zero). Unfinished first.
 * Read in memory: a checklist has a handful of articles and the people are a few hundred.
 */
export async function loadHelpChecklistProgress(event: H3Event, row: HelpChecklistRow, query: HelpProgressQuery): Promise<Page<HelpProgressRow> & HelpProgressSummary> {
  const itemRows = await itemRowsOf([row.id])
  const items = effectiveItems(row.id, itemRows, await helpCenterContentArticles(event))
  const articleIds = items.map(item => item.articleId)
  const requiredIds = new Set(items.filter(item => item.required).map(item => item.articleId))

  const reads: Array<typeof schema.helpReads.$inferSelect> = []
  for (const part of chunked(articleIds)) reads.push(...await db.select().from(schema.helpReads).where(inArray(schema.helpReads.articleId, part)))
  const byUser = new Map<string, Array<typeof schema.helpReads.$inferSelect>>()
  for (const read of reads) byUser.set(read.userId, [...(byUser.get(read.userId) ?? []), read])

  const audience = row.operationId ? await grantsMembers(event, [{ kind: 'operation', operationId: row.operationId }]) : []
  const userIds = [...new Set([...byUser.keys(), ...audience.map(String)])]
  const people = await loadHelpUsers(userIds)

  let rows = userIds.map((id): HelpProgressRow & { sortName: string } => {
    const own = byUser.get(id) ?? []
    const person = people.get(id)
    const last = own.reduce<Date | null>((latest, read) => !latest || read.readAt > latest ? read.readAt : latest, null)
    const requiredReadCount = own.filter(read => requiredIds.has(read.articleId)).length
    return {
      user: { id, name: person?.name ?? null, email: person?.email ?? null },
      readCount: own.length,
      requiredReadCount,
      completed: requiredReadCount >= requiredIds.size,
      lastReadAt: last ? isoDate(last) : null,
      sortName: (person?.name ?? person?.email ?? id).toLocaleLowerCase(),
    }
  })
  const needle = query.q?.toLocaleLowerCase()
  if (needle) rows = rows.filter(entry => entry.sortName.includes(needle) || (entry.user.email ?? '').toLocaleLowerCase().includes(needle))
  const direction = query.order === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    const compare = query.sort === 'name'
      ? a.sortName.localeCompare(b.sortName)
      : query.sort === 'readCount'
        ? a.readCount - b.readCount
        : (a.lastReadAt ?? '').localeCompare(b.lastReadAt ?? '')
    // Unfinished people first among equals, so the people who still have to read something are at the top.
    return compare * direction || Number(a.completed) - Number(b.completed) || a.sortName.localeCompare(b.sortName)
  })
  const start = (query.page - 1) * query.pageSize
  const items_ = rows.slice(start, start + query.pageSize).map(({ sortName: _sortName, ...entry }) => entry)
  return { ...paginate({ items: items_, total: rows.length, query }), requiredCount: requiredIds.size, totalCount: articleIds.length }
}
