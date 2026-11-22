import { readFile } from 'node:fs/promises'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { boundParams, client, db, schema } from './stubs/nuxthub-db'
import { reorderHelpArticles } from '../../src/runtime/server/utils/help-center-db'

// D1 binds at most 100 values per statement. Reordering a category names every article of it (up to 1000), so the
// update goes in chunks, with the positions as literals: this holds it to the limit with more articles than one chunk.
const ARTICLES = 250
const D1_MAX_PARAMS = 100

beforeAll(async () => {
  const init = await readFile(new URL('../fixtures/authenticated/server/db/migrations/sqlite/0000_init.sql', import.meta.url), 'utf8')
  await client.executeMultiple(init.replaceAll('--> statement-breakpoint', ''))
  await db.insert(schema.helpCategories).values([
    { id: 'cat_big', slug: 'big', name: 'Big', sort: 0 },
    { id: 'cat_other', slug: 'other', name: 'Other', sort: 1 },
  ])
  for (let index = 0; index < ARTICLES; index++) {
    await db.insert(schema.helpArticles).values({ id: `art_${index}`, categoryId: 'cat_big', slug: `article-${index}`, title: `Article ${index}`, body: 'Text', status: 'draft', sort: index })
  }
  await db.insert(schema.helpArticles).values({ id: 'art_other', categoryId: 'cat_other', slug: 'other', title: 'Other', body: 'Text', status: 'draft', sort: 7 })
})

beforeEach(() => {
  boundParams.length = 0
})

describe('reordering a category with many articles', () => {
  it('stores the new order, binding at most 100 values per statement', async () => {
    const reversed = Array.from({ length: ARTICLES }, (_, index) => `art_${ARTICLES - 1 - index}`)
    const rows = await reorderHelpArticles('cat_big', reversed)
    expect(rows.map(row => row.id)).toEqual(reversed)
    expect(rows.map(row => row.sort)).toEqual(Array.from({ length: ARTICLES }, (_, index) => index))
    expect(Math.max(...boundParams)).toBeLessThanOrEqual(D1_MAX_PARAMS)
    // Another category is left alone.
    const [other] = await db.select().from(schema.helpArticles).where(eq(schema.helpArticles.id, 'art_other'))
    expect(other!.sort).toBe(7)
  })

  it('refuses an order that does not list every article exactly once', async () => {
    await expect(reorderHelpArticles('cat_big', ['art_0'])).rejects.toMatchObject({ statusCode: 400 })
  })
})
