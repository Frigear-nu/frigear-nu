import { readFile } from 'node:fs/promises'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { boundParams, client, db, schema } from './stubs/nuxthub-db'
import { helpCenterDatabaseSource } from '../../src/runtime/server/utils/help-center-db'
import type { HelpSourceContext } from '../../src/types'

// D1 binds at most 100 values per statement. A reader who may read many categories puts every one of them into the
// article read's `IN (...)`, so it is read in chunks: this holds it to the limit with more categories than one chunk.
const CATEGORIES = 150
const D1_MAX_PARAMS = 100

const context = () => ({ event: { context: {} }, reader: { canRead: async () => true } }) as unknown as HelpSourceContext

beforeAll(async () => {
  const init = await readFile(new URL('../fixtures/authenticated/server/db/migrations/sqlite/0000_init.sql', import.meta.url), 'utf8')
  await client.executeMultiple(init.replaceAll('--> statement-breakpoint', ''))
  const at = new Date('2027-01-01T00:00:00Z').getTime()
  await db.insert(schema.helpCategories).values(Array.from({ length: CATEGORIES }, (_, index) => ({
    id: `cat_${index}`,
    slug: `category-${index}`,
    name: `Category ${index}`,
    sort: index,
  })))
  // One article per category, sorted backwards, so the order of the answer is not the order of the chunks.
  for (let index = 0; index < CATEGORIES; index++) {
    await db.insert(schema.helpArticles).values({
      id: `art_${index}`,
      categoryId: `cat_${index}`,
      slug: `article-${index}`,
      title: index % 50 === 7 ? `Needle ${index}` : `Article ${index}`,
      body: 'Text',
      status: 'published',
      sort: CATEGORIES - index,
      createdAt: new Date(at + index),
    })
  }
})

beforeEach(() => {
  boundParams.length = 0
})

describe('the article list of a reader with many categories', () => {
  it('lists the articles of every readable category, in article order, binding at most 100 values per statement', async () => {
    const articles = await helpCenterDatabaseSource.list(context())
    expect(articles).toHaveLength(CATEGORIES)
    expect(articles.map(article => article.slug)).toEqual(Array.from({ length: CATEGORIES }, (_, index) => `article-${CATEGORIES - 1 - index}`))
    expect(Math.max(...boundParams)).toBeLessThanOrEqual(D1_MAX_PARAMS)
  })

  it('searches across the chunks', async () => {
    const found = await helpCenterDatabaseSource.list({ ...context(), q: 'needle' })
    expect(found.map(article => article.slug).sort()).toEqual(['article-107', 'article-57', 'article-7'])
    expect(Math.max(...boundParams)).toBeLessThanOrEqual(D1_MAX_PARAMS)
  })

  it('answers every category', async () => {
    const categories = await helpCenterDatabaseSource.categories(context())
    expect(categories.filter(category => category.visible)).toHaveLength(CATEGORIES)
  })
})
