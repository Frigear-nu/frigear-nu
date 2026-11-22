import { db, schema } from '@nuxthub/db'
import { asc, inArray, or } from 'drizzle-orm'
import { inChunks, likeContains, searchContains } from '@frigear-nu/module-kit/server'
import type { UserRef } from '../../../types'

// The user lookups other modules need to show people: by id, and a name search for pickers. They only read; the routes
// that call them keep their own permission checks and decide which fields their DTOs copy (email and phone are personal
// data, behind the caller's `:pii` permission).

const userRefColumns = () => ({
  id: schema.users.id,
  name: schema.users.name,
  email: schema.users.email,
  avatar: schema.users.avatar,
  phone: schema.users.phone,
  locale: schema.users.locale,
})

type UserRefRow = { id: number, name: string | null, email: string | null, avatar: string | null, phone: string | null, locale: string | null }

const toUserRef = (row: UserRefRow): UserRef => ({
  id: Number(row.id),
  name: row.name ?? null,
  email: row.email ?? null,
  avatar: row.avatar ?? null,
  phone: row.phone || null,
  locale: row.locale || null,
})

/** The user ids among `ids`: whole numbers (numeric strings count), once each. */
function userIdsOf(ids: Iterable<number | string | null | undefined>): number[] {
  const unique = new Set<number>()
  for (const id of ids) {
    const numeric = typeof id === 'string' && id.trim() ? Number(id) : id
    if (typeof numeric === 'number' && Number.isSafeInteger(numeric)) unique.add(numeric)
  }
  return [...unique]
}

/**
 * Users by id: `id`, `name`, `email`, `avatar`, `phone` and `locale` (the language to write to them in). Ids that are not whole numbers are skipped, and an unknown id
 * is missing from the map. Any number of ids works: they are looked up in D1-sized chunks.
 */
export async function loadUserRefs(ids: Iterable<number | string | null | undefined>): Promise<Map<number, UserRef>> {
  const unique = userIdsOf(ids)
  if (!unique.length) return new Map()
  const rows = await inChunks(unique, part => db.select(userRefColumns()).from(schema.users).where(inArray(schema.users.id, part)))
  return new Map(rows.map(row => [Number(row.id), toUserRef(row)]))
}

/**
 * Users whose name contains `q` (case-insensitively, `Ø`/`Æ`/`Å` too: the folded `users.searchText`), by name, at most `limit` (20, at most 100). With `pii` the email
 * matches too and the refs carry `email` and `phone`; without it both are `null`, so the search cannot probe addresses.
 */
export async function searchUserRefs(q: string, options: { pii?: boolean, limit?: number } = {}): Promise<UserRef[]> {
  const term = q.trim()
  if (!term) return []
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20)))
  const rows = await db.select(userRefColumns()).from(schema.users)
    .where(options.pii ? or(searchContains(schema.users.searchText, term), likeContains(schema.users.email, term)) : searchContains(schema.users.searchText, term))
    .orderBy(asc(schema.users.name), asc(schema.users.id))
    .limit(limit)
  return rows.map(row => options.pii ? toUserRef(row) : { ...toUserRef(row), email: null, phone: null })
}
