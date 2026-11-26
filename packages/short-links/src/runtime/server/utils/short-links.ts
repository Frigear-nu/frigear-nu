import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { apiError, chunkParams, isoDate, isUniqueViolation, newId } from '@frigear-nu/module-kit/server'
import type { CreateShortLinkInput, ShortLink, ShortLinkClickedContext, ShortLinkDto, ShortLinkOwner } from '../../../types'
import {
  SHORT_LINKS_MANUAL_OWNER,
  isVanityCode,
  normalizeShortLinkTarget,
  randomShortCode,
  shortLinkPath,
} from '../../utils/codes'

type ShortLinkRow = typeof schema.shortLinks.$inferSelect

// D1 binds at most 100 parameters per statement and a `short_links` row has 15 columns: 6 rows per insert.
const INSERT_CHUNK = 6
// Random codes that collide with an existing one are drawn again this many times before giving up.
const CODE_ATTEMPTS = 5

function shortLinksConfig(event?: H3Event) {
  const config = useRuntimeConfig(event)
  const own = config.shortLinks as { path?: string, baseUrl?: string } | undefined
  return {
    path: own?.path || '/l',
    baseUrl: own?.baseUrl || (config.public as { siteUrl?: string }).siteUrl || '',
  }
}

/** A stored row as the {@link ShortLink} the utils and hooks hand out. */
export function toShortLink(row: ShortLinkRow): ShortLink {
  return {
    id: row.id,
    code: row.code,
    url: row.url,
    owner: { module: row.ownerModule, refId: row.ownerRefId },
    title: row.title,
    track: row.track,
    expiresAt: row.expiresAt,
    autoDelete: row.autoDelete,
    disabledAt: row.disabledAt,
    clicks: row.clicks,
    lastClickedAt: row.lastClickedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * The short URL of a link: `<baseUrl>/<path>/<code>[/<subject>]`. The origin is `shortLinks.baseUrl` (a separate
 * short domain), else the site URL (`runtimeConfig.public.siteUrl`); without either the path alone is returned.
 * `subject` is opaque to this module (a campaign delivery token, say) and reaches the `short-links:clicked` hook.
 */
export function shortLinkUrl(link: Pick<ShortLink, 'code'>, subject?: string | null, event?: H3Event): string {
  const { path, baseUrl } = shortLinksConfig(event)
  const relative = shortLinkPath(path, link.code, subject)
  if (!baseUrl) return relative
  try {
    const origin = new URL(baseUrl)
    return `${origin.origin}${origin.pathname.replace(/\/+$/, '')}${relative}`
  }
  catch {
    return relative
  }
}

/** Whether a link answers the redirect: not disabled and not expired. */
export function isShortLinkActive(link: Pick<ShortLink, 'disabledAt' | 'expiresAt'>, now = new Date()): boolean {
  if (link.disabledAt) return false
  return !link.expiresAt || link.expiresAt.getTime() > now.getTime()
}

/** The link with `code` (matched case-sensitively), whatever its state, or `null`. */
export async function findShortLink(code: string): Promise<ShortLink | null> {
  if (!code || code.length > 64) return null
  const [row] = await db.select().from(schema.shortLinks).where(eq(schema.shortLinks.code, code)).limit(1)
  return row ? toShortLink(row) : null
}

/** The link with `id`, whatever its state, or `null`. */
export async function findShortLinkById(id: string): Promise<ShortLink | null> {
  const [row] = await db.select().from(schema.shortLinks).where(eq(schema.shortLinks.id, id)).limit(1)
  return row ? toShortLink(row) : null
}

function parseDate(value: Date | string | null | undefined, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw apiError(400, 'invalid_date', `${field} is not a valid date.`, { field })
  return date
}

function checkOwner(owner: ShortLinkOwner | undefined): ShortLinkOwner {
  const module = owner?.module?.trim()
  if (!module || module.length > 64) throw apiError(400, 'invalid_owner', 'A short link needs an owner module.', { field: 'owner' })
  const refId = owner?.refId === undefined || owner.refId === null ? null : String(owner.refId)
  if (refId !== null && refId.length > 191) throw apiError(400, 'invalid_owner', 'The owner reference is too long.', { field: 'owner' })
  return { module, refId }
}

/** The row to insert for `input` (validated); `code` is `undefined` when a random one is to be drawn. */
function prepare(input: CreateShortLinkInput) {
  const url = normalizeShortLinkTarget(input.url ?? '')
  if (!url) throw apiError(400, 'invalid_url', 'A short link must point at an http(s) URL.', { field: 'url' })
  const code = input.code?.trim() || undefined
  if (code !== undefined && !isVanityCode(code)) {
    throw apiError(400, 'invalid_code', 'A code has 3 to 64 letters, digits, dashes or underscores.', { field: 'code' })
  }
  const owner = checkOwner(input.owner)
  const title = input.title?.trim() || null
  return {
    vanity: code,
    values: {
      url,
      ownerModule: owner.module,
      ownerRefId: owner.refId ?? null,
      title: title ? title.slice(0, 200) : null,
      track: input.track ?? true,
      expiresAt: parseDate(input.expiresAt, 'expiresAt'),
      autoDelete: input.autoDelete ?? false,
      createdBy: input.createdBy ?? null,
    },
  }
}

const codeTaken = (code: string) => apiError(409, 'code_taken', `The code "${code}" is taken.`, { field: 'code' })

/**
 * Makes many short links at once, in the order given, inserting a few rows per statement (D1's parameter limit).
 * Random codes that collide are drawn again; a vanity code that is taken (or given twice) is a `409 code_taken`
 * before anything of that chunk is written. Every input is validated before the first insert.
 */
export async function createShortLinks(inputs: CreateShortLinkInput[]): Promise<ShortLink[]> {
  const prepared = inputs.map(prepare)
  const vanity = prepared.flatMap(p => p.vanity ? [p.vanity] : [])
  const duplicate = vanity.find((code, index) => vanity.indexOf(code) !== index)
  if (duplicate) throw codeTaken(duplicate)

  const created: ShortLink[] = []
  for (const chunk of chunkParams(prepared, INSERT_CHUNK)) {
    let pending = chunk.map(p => ({ ...p.values, id: newId('shl'), code: p.vanity ?? randomShortCode(), vanity: p.vanity }))
    // Ids stay the same when a code is drawn again, so they keep the input order.
    const order = pending.map(row => row.id)
    const done = new Map<string, ShortLink>()
    for (let attempt = 0; pending.length; attempt++) {
      const rows = await db.insert(schema.shortLinks)
        .values(pending.map(({ vanity: _vanity, ...row }) => row))
        .onConflictDoNothing({ target: schema.shortLinks.code })
        .returning()
      for (const row of rows) done.set(row.id, toShortLink(row))
      const missing = pending.filter(row => !done.has(row.id))
      const taken = missing.find(row => row.vanity)
      if (taken) {
        // Leave nothing of this chunk behind: the caller sees one error and can retry the whole call.
        if (rows.length) await db.delete(schema.shortLinks).where(inArray(schema.shortLinks.id, rows.map(row => row.id)))
        throw codeTaken(taken.code)
      }
      if (missing.length && attempt + 1 >= CODE_ATTEMPTS) throw apiError(409, 'code_exhausted', 'Could not find a free short code.')
      pending = missing.map(row => ({ ...row, code: randomShortCode() }))
    }
    created.push(...order.map(id => done.get(id)!))
  }
  return created
}

/**
 * Makes one short link. Only `http(s)` targets are accepted; without `code` a random 7 character base62 code is drawn.
 *
 *     const link = await createShortLink({ url: 'https://example.com/apply', owner: { module: 'crew', refId: crewId } })
 *     shortLinkUrl(link) // 'https://example.org/l/x7Gk2Qa'
 */
export async function createShortLink(input: CreateShortLinkInput): Promise<ShortLink> {
  const [link] = await createShortLinks([input])
  return link!
}

/**
 * Disables every active link of `owner` (all of its module when `refId` is left out), e.g. when a campaign is deleted.
 * Resolves with how many links were disabled.
 */
export async function disableShortLinks(owner: ShortLinkOwner): Promise<number> {
  const { module, refId } = checkOwner(owner)
  const conditions = [eq(schema.shortLinks.ownerModule, module), isNull(schema.shortLinks.disabledAt)]
  if (owner.refId !== undefined) conditions.push(refId === null ? isNull(schema.shortLinks.ownerRefId) : eq(schema.shortLinks.ownerRefId, refId))
  const rows = await db.update(schema.shortLinks)
    .set({ disabledAt: new Date() })
    .where(and(...conditions))
    .returning({ id: schema.shortLinks.id })
  return rows.length
}

/**
 * Deletes every link of `owner` (all of its module when `refId` is left out) with its click rows, for links that are
 * no longer needed at all. Resolves with how many links were deleted. Use `disableShortLinks` to keep the counts.
 */
export async function deleteShortLinks(owner: ShortLinkOwner): Promise<number> {
  const { module, refId } = checkOwner(owner)
  const conditions = [eq(schema.shortLinks.ownerModule, module)]
  if (owner.refId !== undefined) conditions.push(refId === null ? isNull(schema.shortLinks.ownerRefId) : eq(schema.shortLinks.ownerRefId, refId))
  return deleteLinksWhere(and(...conditions)!)
}

/**
 * Deletes the links matching `where` and their click rows. The click rows go first in their own statement, so this
 * does not depend on the database enforcing the `ON DELETE CASCADE`.
 */
export async function deleteLinksWhere(where: SQL): Promise<number> {
  const ids = db.select({ id: schema.shortLinks.id }).from(schema.shortLinks).where(where)
  await db.delete(schema.shortLinkClicks).where(inArray(schema.shortLinkClicks.linkId, ids))
  const rows = await db.delete(schema.shortLinks).where(where).returning({ id: schema.shortLinks.id })
  return rows.length
}

/** Sets or clears `disabledAt` of one link; resolves with the updated link, or `null` when there is none. */
export async function setShortLinkDisabled(id: string, disabled: boolean): Promise<ShortLink | null> {
  const [row] = await db.update(schema.shortLinks)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(schema.shortLinks.id, id))
    .returning()
  return row ? toShortLink(row) : null
}

/** What the admin may change on a link made by hand. */
export type ShortLinkPatch = {
  url?: string
  code?: string
  title?: string | null
  track?: boolean
  expiresAt?: Date | string | null
  autoDelete?: boolean
}

/** Applies `patch` to a link (validated like a new link); a taken code is a `409 code_taken`. */
export async function updateShortLink(id: string, patch: ShortLinkPatch): Promise<ShortLink | null> {
  const values: Partial<typeof schema.shortLinks.$inferInsert> = {}
  if (patch.url !== undefined) {
    const url = normalizeShortLinkTarget(patch.url)
    if (!url) throw apiError(400, 'invalid_url', 'A short link must point at an http(s) URL.', { field: 'url' })
    values.url = url
  }
  if (patch.code !== undefined) {
    const code = patch.code.trim()
    if (!isVanityCode(code)) throw apiError(400, 'invalid_code', 'A code has 3 to 64 letters, digits, dashes or underscores.', { field: 'code' })
    values.code = code
  }
  if (patch.title !== undefined) values.title = patch.title?.trim().slice(0, 200) || null
  if (patch.track !== undefined) values.track = patch.track
  if (patch.expiresAt !== undefined) values.expiresAt = parseDate(patch.expiresAt, 'expiresAt')
  if (patch.autoDelete !== undefined) values.autoDelete = patch.autoDelete
  if (!Object.keys(values).length) return findShortLinkById(id)
  try {
    const [row] = await db.update(schema.shortLinks).set(values).where(eq(schema.shortLinks.id, id)).returning()
    return row ? toShortLink(row) : null
  }
  catch (error) {
    if (values.code && isUniqueViolation(error)) throw codeTaken(values.code)
    throw error
  }
}

/** The host of a `Referer` header, or `null`. */
function referrerHostOf(event: H3Event): string | null {
  const referer = getRequestHeader(event, 'referer')
  if (!referer) return null
  try {
    return new URL(referer).hostname.slice(0, 255) || null
  }
  catch {
    return null
  }
}

/**
 * Counts one click of `link`: the counter and `lastClickedAt`, a `short_link_clicks` row when the link has `track`
 * on, then the `short-links:clicked` hook. A failing write or hook is logged, never thrown: the visitor is redirected
 * whatever happens here.
 */
export async function recordShortLinkClick(event: H3Event, link: ShortLink, subject: string | null): Promise<void> {
  const at = new Date()
  try {
    await db.update(schema.shortLinks)
      .set({ clicks: sql`${schema.shortLinks.clicks} + 1`, lastClickedAt: at, updatedAt: link.updatedAt })
      .where(eq(schema.shortLinks.id, link.id))
    if (link.track) {
      await db.insert(schema.shortLinkClicks).values({ linkId: link.id, at, subject, referrerHost: referrerHostOf(event) })
    }
  }
  catch (error) {
    console.error('[short-links] Could not count a click.', error)
  }
  try {
    const ctx: ShortLinkClickedContext = { event, link, subject }
    await useNitroApp().hooks.callHook('short-links:clicked', ctx)
  }
  catch (error) {
    console.error('[short-links] A short-links:clicked listener failed.', error)
  }
}

/** The admin API's view of a link. */
export function toShortLinkDto(link: ShortLink, event?: H3Event): ShortLinkDto {
  return {
    id: link.id,
    code: link.code,
    url: link.url,
    shortUrl: shortLinkUrl(link, null, event),
    owner: { module: link.owner.module, refId: link.owner.refId ?? null },
    title: link.title,
    track: link.track,
    expiresAt: isoDate(link.expiresAt),
    autoDelete: link.autoDelete,
    disabledAt: isoDate(link.disabledAt),
    clicks: link.clicks,
    lastClickedAt: isoDate(link.lastClickedAt),
    createdAt: isoDate(link.createdAt),
    updatedAt: isoDate(link.updatedAt),
    editable: link.owner.module === SHORT_LINKS_MANUAL_OWNER,
  }
}
