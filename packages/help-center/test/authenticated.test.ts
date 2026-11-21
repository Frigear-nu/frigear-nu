import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { faqApi } from '../../faq/src/runtime/utils/api'
import { helpCenterApi } from '../src/runtime/utils/api'
import { helpCenterAccess } from '../src/runtime/access'
import { getEmails, getTexts, registerUser, setPhone, takePart } from './helpers'

type Session = Awaited<ReturnType<typeof registerUser>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

// The raw response of one call as `cookie` (or anonymously), whatever its status.
const json = (cookie: string | undefined, method: ApiMethod, path: string, body?: unknown) => apiClient({ cookie }).fetch(method, path, body)
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.json() as Promise<Json>
}

const both = (en: string, da: string) => ({ en, da })
// Grant lists (`@frigear-nu/grants`): any one grant admits, an empty list admits nobody. Every signed-in user of the
// fixture holds the default role `member`, so MEMBERS is "every signed-in user".
const PUBLIC = [{ kind: 'public' }]
const MEMBERS = [{ kind: 'role', role: 'member' }]
const SUPERVISORS = [{ kind: 'role', role: 'supervisor' }]
const operation = (operationId: string) => [{ kind: 'operation', operationId }]
let counter = 0

async function createToken(cookie: string, scopes: string[]) {
  return (await ok(await json(cookie, 'POST', authApi.me.tokens, { name: 'test', scopes }))).token as string
}

describe('help center (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: Session
  const user = async (name: string) => registerUser(name, `${name.toLowerCase()}${++counter}@example.com`)
  const supervisor = async () => registerUser('Bar', `bar${++counter}@bar.test`)
  const asStaff = async () => (staff ??= await registerUser('Staff', 'staff@staff.test'))

  async function createCategory(overrides: Json = {}): Promise<Json> {
    await asStaff()
    return ok(await json(staff.cookie, 'POST', helpCenterApi.admin.categories, {
      slug: `category-${++counter}`,
      name: both('Safety', 'Sikkerhed'),
      grants: MEMBERS,
      ...overrides,
    }))
  }

  /** A draft article with both languages, so it can be published. */
  async function createArticle(categoryId: string, overrides: Json = {}): Promise<Json> {
    await asStaff()
    return ok(await json(staff.cookie, 'POST', helpCenterApi.admin.articles, {
      categoryId,
      slug: `article-${++counter}`,
      title: both(`Article ${counter}`, `Artikel ${counter}`),
      body: both(`Body ${counter}.`, `Tekst ${counter}.`),
      ...overrides,
    }))
  }

  async function publish(articleId: string) {
    return ok(await json(staff.cookie, 'POST', helpCenterApi.admin.publish(articleId)))
  }

  /** A category with a published article, ready for the public API. */
  async function publishedArticle(categoryOverrides: Json = {}, articleOverrides: Json = {}) {
    const category = await createCategory(categoryOverrides)
    const article = await publish((await createArticle(category.id, articleOverrides)).id)
    return { category, article }
  }

  const listArticles = async (cookie: string | undefined, query = '') => await ok(await json(cookie, 'GET', `${helpCenterApi.articles}${query}`)) as unknown as Json[]
  const listCategories = async (cookie: string | undefined, query = '') => await ok(await json(cookie, 'GET', `${helpCenterApi.categories}${query}`)) as unknown as Json[]
  const slugsOf = (list: Json[]) => list.map(entry => entry.slug)

  describe('access', () => {
    it('denies the admin API by default: anonymous 401, non-staff 403', async () => {
      const nobody = await user('Nobody')
      expect((await json(undefined, 'GET', helpCenterApi.admin.categories)).status).toBe(401)
      expect((await json(undefined, 'POST', helpCenterApi.admin.articles, {})).status).toBe(401)
      for (const [method, path] of [
        ['GET', helpCenterApi.admin.categories],
        ['POST', helpCenterApi.admin.categories],
        ['GET', helpCenterApi.admin.articles],
        ['GET', helpCenterApi.admin.article('hlp_missing')],
        ['POST', helpCenterApi.admin.publish('hlp_missing')],
        ['GET', helpCenterApi.admin.checklists],
        ['GET', helpCenterApi.admin.checklist('hck_missing')],
        ['GET', helpCenterApi.admin.progress('hck_missing')],
        ['POST', helpCenterApi.admin.send],
      ] as const) {
        await expectApiError(json(nobody.cookie, method, path, method === 'POST' ? {} : undefined), 403, 'forbidden')
      }
    })

    it('answers 401 before 404 on the admin API', async () => {
      expect((await json(undefined, 'PATCH', helpCenterApi.admin.category('hlc_missing'), {})).status).toBe(401)
      expect((await json(undefined, 'DELETE', helpCenterApi.admin.category('hlc_missing'))).status).toBe(401)
      expect((await json(undefined, 'PATCH', helpCenterApi.admin.article('hlp_missing'), {})).status).toBe(401)
      expect((await json(undefined, 'DELETE', helpCenterApi.admin.article('hlp_missing'))).status).toBe(401)
      expect((await json(undefined, 'POST', helpCenterApi.admin.unpublish('hlp_missing'))).status).toBe(401)
      expect((await json(undefined, 'GET', helpCenterApi.admin.progress('hck_missing'))).status).toBe(401)
      expect((await json(undefined, 'GET', helpCenterApi.me.checklists)).status).toBe(401)
      expect((await json(undefined, 'POST', helpCenterApi.me.reads, { articleId: 'hlp_missing' })).status).toBe(401)
    })

    it('lets a staff token manage with the permission, and refuses one without (insufficient_scope)', async () => {
      await asStaff()
      const withManage = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.manage]) })
      const created = await withManage.json<Json>('POST', helpCenterApi.admin.categories, { slug: `token-${++counter}`, name: 'By token' })
      expect(created.id).toMatch(/^hlc_/)

      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.read]) })
      await expectApiError(readOnly.json('GET', helpCenterApi.admin.categories), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', helpCenterApi.admin.categories, { slug: `nope-${++counter}`, name: 'No' }), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('PATCH', helpCenterApi.admin.category(created.id), { sort: 1 }), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('DELETE', helpCenterApi.admin.category(created.id)), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', helpCenterApi.admin.articles, {}), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', helpCenterApi.admin.publish('hlp_x')), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', helpCenterApi.admin.checklists, {}), 403, 'insufficient_scope')
    })

    it('lets a role holding help-center:* manage and send, but never read who read what (:pii is never covered by a wildcard)', async () => {
      const wild = await registerUser('Wild', `wild${++counter}@wild.test`)
      expect((await json(wild.cookie, 'GET', helpCenterApi.admin.categories)).status).toBe(200)
      const checklist = await ok(await json((await asStaff()).cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Wild list' }))
      await expectApiError(json(wild.cookie, 'GET', helpCenterApi.admin.progress(checklist.id)), 403, 'forbidden')
      // `send` is not sensitive: the wildcard reaches it (the body is validated after the check, so a 400 is a pass).
      expect((await json(wild.cookie, 'POST', helpCenterApi.admin.send, {})).status).toBe(400)
    })
  })

  describe('admin: categories', () => {
    it('creates, edits and deletes a category as a coordinator', async () => {
      await asStaff()
      const response = await json(staff.cookie, 'POST', helpCenterApi.admin.categories, {
        slug: `crud-${++counter}`,
        name: both('Safety', 'Sikkerhed'),
        description: both('About safety', 'Om sikkerhed'),
        grants: PUBLIC,
        faqGroups: ['volunteering'],
      })
      expect(response.status).toBe(201)
      const created = await response.json() as Json
      expect(created).toMatchObject({
        id: expect.stringMatching(/^hlc_/),
        name: both('Safety', 'Sikkerhed'),
        description: both('About safety', 'Om sikkerhed'),
        public: true,
        grants: PUBLIC,
        owner: { type: 'platform', id: null },
        faqGroups: ['volunteering'],
        articleCount: 0,
        parentId: null,
      })

      const edited = await ok(await json(staff.cookie, 'PATCH', helpCenterApi.admin.category(created.id), { name: both('Safe', 'Sikker'), grants: [], faqGroups: null }))
      expect(edited).toMatchObject({ name: both('Safe', 'Sikker'), public: false, grants: [], faqGroups: [] })

      expect((await json(staff.cookie, 'DELETE', helpCenterApi.admin.category(created.id))).status).toBe(204)
      expect(slugsOf(await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.categories)) as unknown as Json[])).not.toContain(created.slug)
      expect((await json(staff.cookie, 'PATCH', helpCenterApi.admin.category(created.id), {})).status).toBe(404)
    })

    it('refuses a duplicate slug (409) and malformed or reserved ones (400)', async () => {
      const first = await createCategory()
      await expectApiError(json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug: first.slug, name: 'Again' }), 409, 'conflict')
      for (const slug of ['search', 'articles', 'Not Valid', '']) {
        expect((await json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug, name: 'X' })).status, slug).toBe(400)
      }
      const other = await createCategory()
      await expectApiError(json(staff.cookie, 'PATCH', helpCenterApi.admin.category(other.id), { slug: first.slug }), 409, 'conflict')
    })

    it('refuses an unknown grant kind, an invalid grant and an operation that does not exist', async () => {
      await asStaff()
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug: `v-${++counter}`, name: 'X', grants: [{ kind: 'galaxy' }] })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug: `v-${++counter}`, name: 'X', grants: [{ kind: 'role', role: 'x', permission: 'x' }] })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug: `v-${++counter}`, name: 'X', grants: operation('opr_unknown') })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug: `v-${++counter}`, name: 'X', grants: operation('opr_known') })).status).toBe(201)
    })

    it('checks the owner through teams:owner:resolve', async () => {
      await asStaff()
      const create = (owner: Json) => json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug: `o-${++counter}`, name: 'X', owner })
      expect((await create({ type: 'operation', id: 'opr_known' })).status).toBe(201)
      expect((await create({ type: 'operation', id: 'opr_unknown' })).status).toBe(400)
      expect((await create({ type: 'operation' })).status).toBe(400)
      expect((await create({ type: 'platform', id: 'x' })).status).toBe(400)
      expect((await create({ type: 'mystery', id: 'x' })).status).toBe(400)
    })

    it('nests categories and refuses a loop or a missing parent', async () => {
      const parent = await createCategory()
      const child = await createCategory({ parentId: parent.id })
      expect(child.parentId).toBe(parent.id)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.categories, { slug: `p-${++counter}`, name: 'X', parentId: 'hlc_missing' })).status).toBe(400)
      expect((await json(staff.cookie, 'PATCH', helpCenterApi.admin.category(parent.id), { parentId: parent.id })).status).toBe(400)
      expect((await json(staff.cookie, 'PATCH', helpCenterApi.admin.category(parent.id), { parentId: child.id })).status).toBe(400)
    })

    it('does not delete a category that still has articles (409), and moves subcategories up when it is deleted', async () => {
      const top = await createCategory()
      const middle = await createCategory({ parentId: top.id })
      const leaf = await createCategory({ parentId: middle.id })
      const article = await createArticle(middle.id)
      const blocked = await expectApiError(json(staff.cookie, 'DELETE', helpCenterApi.admin.category(middle.id)), 409, 'category_not_empty')
      expect(blocked.data).toMatchObject({ articleCount: 1 })
      expect((await json(staff.cookie, 'DELETE', helpCenterApi.admin.article(article.id))).status).toBe(204)
      expect((await json(staff.cookie, 'DELETE', helpCenterApi.admin.category(middle.id))).status).toBe(204)
      const all = await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.categories)) as unknown as Json[]
      expect(all.find(category => category.id === leaf.id)?.parentId).toBe(top.id)
    })

    it('counts the articles of each category', async () => {
      const category = await createCategory()
      await createArticle(category.id)
      await createArticle(category.id)
      const all = await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.categories)) as unknown as Json[]
      expect(all.find(entry => entry.id === category.id)?.articleCount).toBe(2)
    })
  })

  describe('admin: articles and the publish rule', () => {
    it('adds a draft that nobody but staff sees, and publishes it', async () => {
      const category = await createCategory({ grants: PUBLIC })
      const response = await json(staff.cookie, 'POST', helpCenterApi.admin.articles, {
        categoryId: category.id,
        slug: `draft-${++counter}`,
        title: both('Draft', 'Kladde'),
        body: both('Text', 'Tekst'),
      })
      expect(response.status).toBe(201)
      const draft = await response.json() as Json
      expect(draft).toMatchObject({ id: expect.stringMatching(/^hlp_/), status: 'draft', source: 'database', readOnly: false, publishedAt: null, categoryId: category.id, categorySlug: category.slug })
      expect(slugsOf(await listArticles(undefined))).not.toContain(draft.slug)
      expect(slugsOf(await listArticles(staff.cookie))).not.toContain(draft.slug)
      expect((await json(undefined, 'GET', helpCenterApi.article(draft.slug))).status).toBe(404)

      const published = await publish(draft.id)
      expect(published.status).toBe('published')
      expect(published.publishedAt).toEqual(expect.any(String))
      expect(slugsOf(await listArticles(undefined))).toContain(draft.slug)
      // Publishing a published article changes nothing.
      expect(await publish(draft.id)).toMatchObject({ status: 'published', publishedAt: published.publishedAt })
    })

    it('refuses to publish without Danish and English in both title and body (409 missing_translations)', async () => {
      const category = await createCategory()
      const article = await createArticle(category.id, { title: { en: 'Only English' }, body: { da: 'Kun dansk' } })
      const refused = await expectApiError(json(staff.cookie, 'POST', helpCenterApi.admin.publish(article.id)), 409, 'missing_translations')
      expect(refused.data?.missing).toEqual([
        { field: 'title', locales: ['da'] },
        { field: 'body', locales: ['en'] },
      ])
      // A plain string is one text for every language, not a written translation.
      const plain = await createArticle(category.id, { title: 'Plain', body: 'Plain' })
      const plainRefused = await expectApiError(json(staff.cookie, 'POST', helpCenterApi.admin.publish(plain.id)), 409, 'missing_translations')
      expect(plainRefused.data?.missing).toHaveLength(2)

      await ok(await json(staff.cookie, 'PATCH', helpCenterApi.admin.article(article.id), { title: both('Only English', 'Kun engelsk'), body: both('Both', 'Begge') }))
      expect((await publish(article.id)).status).toBe('published')
    })

    it('keeps a published article complete: an edit that removes a language is 409', async () => {
      const { article } = await publishedArticle()
      const refused = await expectApiError(json(staff.cookie, 'PATCH', helpCenterApi.admin.article(article.id), { body: { da: 'Kun dansk' } }), 409, 'missing_translations')
      expect(refused.data?.missing).toEqual([{ field: 'body', locales: ['en'] }])
      expect((await ok(await json(staff.cookie, 'PATCH', helpCenterApi.admin.article(article.id), { body: both('New body', 'Ny tekst') }))).body).toEqual(both('New body', 'Ny tekst'))
    })

    it('turns a published article back into a draft', async () => {
      const { category, article } = await publishedArticle({ grants: PUBLIC })
      expect(slugsOf(await listArticles(undefined))).toContain(article.slug)
      expect((await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.unpublish(article.id)))).status).toBe('draft')
      expect(slugsOf(await listArticles(undefined))).not.toContain(article.slug)
      expect(slugsOf(await listArticles(undefined, `?category=${category.slug}`))).toEqual([])
    })

    it('refuses an article in a category that does not exist, and a duplicate slug', async () => {
      const category = await createCategory()
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.articles, { categoryId: 'hlc_missing', slug: `x-${++counter}`, title: 'T', body: 'B' })).status).toBe(400)
      const article = await createArticle(category.id)
      await expectApiError(json(staff.cookie, 'POST', helpCenterApi.admin.articles, { categoryId: category.id, slug: article.slug, title: 'T', body: 'B' }), 409, 'conflict')
      const other = await createArticle(category.id)
      await expectApiError(json(staff.cookie, 'PATCH', helpCenterApi.admin.article(other.id), { slug: article.slug }), 409, 'conflict')
      expect((await json(staff.cookie, 'PATCH', helpCenterApi.admin.article(other.id), { categoryId: 'hlc_missing' })).status).toBe(400)
    })

    it('moves an article to another category', async () => {
      const from = await createCategory()
      const to = await createCategory()
      const article = await createArticle(from.id)
      const moved = await ok(await json(staff.cookie, 'PATCH', helpCenterApi.admin.article(article.id), { categoryId: to.id }))
      expect(moved).toMatchObject({ categoryId: to.id, categorySlug: to.slug })
    })

    it('lists every article for staff, paginated and filtered', async () => {
      const marker = `marker${++counter}`
      const category = await createCategory({ slug: `${marker}-cat` })
      const a = await createArticle(category.id, { slug: `${marker}-a`, title: both('Alpha', 'Alfa') })
      await createArticle(category.id, { slug: `${marker}-b`, title: both('Beta', 'Beta') })
      await publish(a.id)

      const page = await ok(await json(staff.cookie, 'GET', `${helpCenterApi.admin.articles}?category=${category.slug}&pageSize=1&sort=slug&order=asc`))
      expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 })
      expect(page.items.map((item: Json) => item.slug)).toEqual([`${marker}-a`])
      const published = await ok(await json(staff.cookie, 'GET', `${helpCenterApi.admin.articles}?category=${category.slug}&status=published`))
      expect(published.items.map((item: Json) => item.slug)).toEqual([`${marker}-a`])
      const found = await ok(await json(staff.cookie, 'GET', `${helpCenterApi.admin.articles}?q=alfa`))
      expect(found.items.map((item: Json) => item.slug)).toContain(`${marker}-a`)
      // No Nuxt Content in this fixture: that source is empty, the database one is not.
      expect((await ok(await json(staff.cookie, 'GET', `${helpCenterApi.admin.articles}?source=content`))).total).toBe(0)
      expect((await ok(await json(staff.cookie, 'GET', `${helpCenterApi.admin.articles}?source=database&category=${category.slug}`))).total).toBe(2)
    })

    it('reads one article for staff, and deletes it', async () => {
      const category = await createCategory()
      const article = await createArticle(category.id)
      expect(await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.article(article.id)))).toMatchObject({ id: article.id, status: 'draft' })
      expect((await json(staff.cookie, 'DELETE', helpCenterApi.admin.article(article.id))).status).toBe(204)
      expect((await json(staff.cookie, 'GET', helpCenterApi.admin.article(article.id))).status).toBe(404)
      expect((await json(staff.cookie, 'GET', helpCenterApi.admin.article('content:help:missing'))).status).toBe(404)
    })
  })

  describe('grants', () => {
    it('shows anonymous visitors public articles only', async () => {
      const open = await publishedArticle({ grants: PUBLIC })
      const signedIn = await publishedArticle()
      const slugs = slugsOf(await listArticles(undefined))
      expect(slugs).toContain(open.article.slug)
      expect(slugs).not.toContain(signedIn.article.slug)
      expect(slugsOf(await listCategories(undefined))).toContain(open.category.slug)
      expect(slugsOf(await listCategories(undefined))).not.toContain(signedIn.category.slug)
      // The same 404 for an article that does not exist and one the visitor may not read.
      const hidden = await json(undefined, 'GET', helpCenterApi.article(signedIn.article.slug))
      const missing = await json(undefined, 'GET', helpCenterApi.article('no-such-article'))
      expect(hidden.status).toBe(404)
      expect(await hidden.json()).toMatchObject({ statusMessage: 'Help article not found.' })
      expect(await missing.json()).toMatchObject({ statusMessage: 'Help article not found.' })
    })

    it('shows a signed-in person public and signed-in articles, and flags what is public', async () => {
      const open = await publishedArticle({ grants: PUBLIC })
      const signedIn = await publishedArticle()
      const member = await user('Member')
      const mine = await listArticles(member.cookie)
      expect(slugsOf(mine)).toEqual(expect.arrayContaining([open.article.slug, signedIn.article.slug]))
      expect(mine.find(article => article.slug === open.article.slug)?.public).toBe(true)
      expect(mine.find(article => article.slug === signedIn.article.slug)?.public).toBe(false)
      // The list leaves the text out; one article has it, with its category.
      expect(mine[0]).not.toHaveProperty('body')
      const detail = await ok(await json(member.cookie, 'GET', helpCenterApi.article(signedIn.article.slug)))
      expect(detail).toMatchObject({ slug: signedIn.article.slug, body: signedIn.article.body, category: { slug: signedIn.category.slug } })
    })

    it('answers ?public=1 the same for everyone, and lets it be cached; the viewer-filtered answer is not', async () => {
      const open = await publishedArticle({ grants: PUBLIC })
      const restricted = await publishedArticle({ grants: SUPERVISORS })
      const bar = await supervisor()
      const member = await user('Member')

      const anonymous = await listArticles(undefined, '?public=1')
      expect(slugsOf(anonymous)).toContain(open.article.slug)
      expect(slugsOf(anonymous)).not.toContain(restricted.article.slug)
      for (const cookie of [member.cookie, bar.cookie, staff.cookie]) expect(await listArticles(cookie, '?public=1')).toEqual(anonymous)
      expect(await listCategories(bar.cookie, '?public=1')).toEqual(await listCategories(undefined, '?public=1'))
      expect((await json(bar.cookie, 'GET', `${helpCenterApi.article(restricted.article.slug)}?public=1`)).status).toBe(404)

      const publicResponse = await json(undefined, 'GET', `${helpCenterApi.articles}?public=1`)
      expect(publicResponse.headers.get('cache-control')).toBe('public, max-age=60, stale-while-revalidate=300')
      expect((await json(undefined, 'GET', `${helpCenterApi.categories}?public=1`)).headers.get('cache-control')).toContain('public')
      expect((await json(undefined, 'GET', `${helpCenterApi.article(open.article.slug)}?public=1`)).headers.get('cache-control')).toContain('public')
      for (const path of [helpCenterApi.articles, helpCenterApi.categories, helpCenterApi.article(open.article.slug)]) {
        expect((await json(bar.cookie, 'GET', path)).headers.get('cache-control')).toBe('private, no-store')
      }
    })

    it('shows a restricted category to the roles it names, and to nobody else', async () => {
      const { category, article } = await publishedArticle({ grants: SUPERVISORS })
      const member = await user('Member')
      const bar = await supervisor()
      expect(slugsOf(await listArticles(undefined))).not.toContain(article.slug)
      expect(slugsOf(await listArticles(member.cookie))).not.toContain(article.slug)
      expect(slugsOf(await listArticles(bar.cookie))).toContain(article.slug)
      expect(slugsOf(await listCategories(member.cookie))).not.toContain(category.slug)
      expect(slugsOf(await listCategories(bar.cookie))).toContain(category.slug)
      expect(slugsOf(await listArticles(bar.cookie, `?category=${category.slug}`))).toEqual([article.slug])
      expect(await listArticles(member.cookie, `?category=${category.slug}`)).toEqual([])
      expect((await json(member.cookie, 'GET', helpCenterApi.article(article.slug))).status).toBe(404)
      expect((await json(bar.cookie, 'GET', helpCenterApi.article(article.slug))).status).toBe(200)
    })

    it('admits on any one grant, and nobody with an empty list', async () => {
      const either = await publishedArticle({ grants: [...SUPERVISORS, ...operation('opr_either')] })
      const nobody = await publishedArticle({ grants: [] })
      const outsider = await user('Outsider')
      const crew = await user('Crew')
      await takePart('opr_either', [crew.id])
      const bar = await supervisor()
      expect(slugsOf(await listArticles(outsider.cookie))).not.toContain(either.article.slug)
      expect(slugsOf(await listArticles(crew.cookie))).toContain(either.article.slug)
      expect(slugsOf(await listArticles(bar.cookie))).toContain(either.article.slug)
      // The empty list is nobody, never "every signed-in user": not even staff on the public API.
      for (const session of [outsider, crew, bar, staff]) expect(slugsOf(await listArticles(session.cookie))).not.toContain(nobody.article.slug)
      expect((await json(bar.cookie, 'GET', helpCenterApi.article(nobody.article.slug))).status).toBe(404)
    })

    it('limits a category to the people who take part in an operation', async () => {
      const { article } = await publishedArticle({ grants: operation('opr_known') })
      const outsider = await user('Outsider')
      const crew = await user('Crew')
      await takePart('opr_known', [crew.id])
      expect(slugsOf(await listArticles(outsider.cookie))).not.toContain(article.slug)
      expect(slugsOf(await listArticles(crew.cookie))).toContain(article.slug)
    })

    it('lets an article narrow its category, never widen it', async () => {
      const category = await createCategory({ grants: PUBLIC })
      const narrower = await publish((await createArticle(category.id, { grants: SUPERVISORS })).id)
      const inherits = await publish((await createArticle(category.id)).id)
      const member = await user('Member')
      const bar = await supervisor()
      expect(slugsOf(await listArticles(undefined, `?category=${category.slug}`))).toEqual([inherits.slug])
      expect(slugsOf(await listArticles(member.cookie, `?category=${category.slug}`))).toEqual([inherits.slug])
      expect(slugsOf(await listArticles(bar.cookie, `?category=${category.slug}`)).sort()).toEqual([narrower.slug, inherits.slug].sort())
      expect((await json(undefined, 'GET', helpCenterApi.article(narrower.slug))).status).toBe(404)
      expect((await json(member.cookie, 'GET', helpCenterApi.article(narrower.slug))).status).toBe(404)

      const restricted = await createCategory({ grants: SUPERVISORS })
      const widening = await publish((await createArticle(restricted.id, { grants: PUBLIC })).id)
      expect(slugsOf(await listArticles(undefined))).not.toContain(widening.slug)
      expect(slugsOf(await listArticles(member.cookie))).not.toContain(widening.slug)
      expect(slugsOf(await listArticles(bar.cookie))).toContain(widening.slug)
      // It is not public either: the flag follows the category.
      expect((await listArticles(bar.cookie)).find(article => article.slug === widening.slug)?.public).toBe(false)
    })

    it('lets a subcategory inherit what its ancestors hide: a category is visible only when every category above it is', async () => {
      const parent = await createCategory({ grants: SUPERVISORS })
      const child = await createCategory({ parentId: parent.id, grants: PUBLIC })
      const grandchild = await createCategory({ parentId: child.id })
      const inChild = await publish((await createArticle(child.id)).id)
      const inGrandchild = await publish((await createArticle(grandchild.id, { grants: PUBLIC })).id)
      const member = await user('Member')
      const bar = await supervisor()

      for (const cookie of [undefined, member.cookie]) {
        expect(slugsOf(await listCategories(cookie))).not.toEqual(expect.arrayContaining([child.slug]))
        expect(slugsOf(await listCategories(cookie))).not.toContain(grandchild.slug)
        expect(slugsOf(await listArticles(cookie))).not.toContain(inChild.slug)
        expect(slugsOf(await listArticles(cookie))).not.toContain(inGrandchild.slug)
        expect((await json(cookie, 'GET', helpCenterApi.article(inChild.slug))).status).toBe(404)
        expect((await json(cookie, 'GET', helpCenterApi.article(inGrandchild.slug))).status).toBe(404)
      }
      expect(slugsOf(await listArticles(undefined, '?public=1'))).not.toContain(inChild.slug)
      expect(slugsOf(await listCategories(bar.cookie))).toEqual(expect.arrayContaining([parent.slug, child.slug, grandchild.slug]))
      expect(slugsOf(await listArticles(bar.cookie))).toEqual(expect.arrayContaining([inChild.slug, inGrandchild.slug]))
      // Public in its own right, but not public: an ancestor restricts it.
      expect((await listArticles(bar.cookie)).find(article => article.slug === inChild.slug)?.public).toBe(false)
      expect((await listCategories(bar.cookie)).find(category => category.slug === child.slug)?.public).toBe(false)

      // Reading, checklists and searching follow the same rule.
      const reader = await user('Reader')
      expect((await json(reader.cookie, 'POST', helpCenterApi.me.reads, { articleId: inChild.id })).status).toBe(404)
      expect((await json(bar.cookie, 'POST', helpCenterApi.me.reads, { articleId: inChild.id })).status).toBe(200)
      expect(await listArticles(undefined, `?q=${encodeURIComponent(inChild.title.en)}`)).toEqual([])
      expect(slugsOf(await listArticles(bar.cookie, `?q=${encodeURIComponent(inChild.title.en)}`))).toContain(inChild.slug)
    })

    it('gives a token without help-center:read the public articles only, and one with it the viewer\'s own', async () => {
      const open = await publishedArticle({ grants: PUBLIC })
      const signedIn = await publishedArticle()
      await asStaff()
      const withoutRead = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.manage]) })
      expect(slugsOf(await withoutRead.json<Json[]>('GET', helpCenterApi.articles))).toEqual(expect.arrayContaining([open.article.slug]))
      expect(slugsOf(await withoutRead.json<Json[]>('GET', helpCenterApi.articles))).not.toContain(signedIn.article.slug)
      const withRead = apiClient({ bearer: await createToken(staff.cookie, ['help-center']) })
      expect(slugsOf(await withRead.json<Json[]>('GET', helpCenterApi.articles))).toContain(signedIn.article.slug)
    })
  })

  describe('sources', () => {
    it('merges the articles of a registered source; with precedence: wiki the wiki wins a clash of slugs', async () => {
      await asStaff()
      const guides = await createCategory({ slug: 'db-guides', grants: PUBLIC })
      await publish((await createArticle(guides.id, { slug: 'shared-slug', title: both('From the database', 'Fra databasen') })).id)

      const anonymous = await listArticles(undefined)
      const wiki = anonymous.find(article => article.slug === 'wiki-parking')
      expect(wiki).toMatchObject({ id: 'wiki:guides/parking', source: 'wiki', public: true, categorySlug: 'wiki-guides', title: both('Parking', 'Parkering') })
      const shared = anonymous.filter(article => article.slug === 'shared-slug')
      expect(shared).toHaveLength(1)
      // `content.precedence` is `wiki` in this fixture: the source that is not the database wins the article.
      expect(shared[0]).toMatchObject({ source: 'wiki', title: both('From the wiki', 'Fra wiki') })

      // The source's categories are listed too.
      expect(slugsOf(await listCategories(undefined))).toContain('wiki-guides')
      const article = await ok(await json(undefined, 'GET', helpCenterApi.article('wiki-parking')))
      expect(article).toMatchObject({ source: 'wiki', body: both('Park at the gate.', 'Parkér ved porten.'), category: { slug: 'wiki-guides' } })
    })

    it('keeps an always-public article of a source out of a restricted category\'s listing, but not out of its URL', async () => {
      const restricted = await createCategory({ slug: 'wiki-staff', grants: SUPERVISORS })
      expect(restricted.slug).toBe('wiki-staff')
      const bar = await supervisor()
      const member = await user('Member')
      // Categories ignore the precedence: the database goes first, so its hidden category keeps claiming the slug and the
      // source's own `wiki-staff` category cannot show up for the others, although the wiki wins articles here.
      expect(slugsOf(await listCategories(member.cookie))).not.toContain('wiki-staff')
      expect(slugsOf(await listArticles(undefined))).not.toContain('wiki-staff-note')
      expect(slugsOf(await listArticles(member.cookie))).not.toContain('wiki-staff-note')
      expect(await listArticles(member.cookie, '?category=wiki-staff')).toEqual([])
      expect(slugsOf(await listArticles(bar.cookie, '?category=wiki-staff'))).toEqual(['wiki-staff-note'])
      // Content is public: by its address anybody can still open it.
      expect((await json(undefined, 'GET', helpCenterApi.article('wiki-staff-note'))).status).toBe(200)
      expect((await json(member.cookie, 'GET', helpCenterApi.article('wiki-staff-note'))).status).toBe(200)
    })

    it('lets staff read an article of another source by its id, also one that holds a slash', async () => {
      await asStaff()
      const article = await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.article('wiki:guides/parking')))
      expect(article).toMatchObject({ id: 'wiki:guides/parking', source: 'wiki', readOnly: true, status: 'published', slug: 'wiki-parking', categorySlug: 'wiki-guides' })
      expect((await json(staff.cookie, 'GET', helpCenterApi.admin.article('wiki:guides/nothing'))).status).toBe(404)
      const member = await user('Member')
      await expectApiError(json(member.cookie, 'GET', helpCenterApi.admin.article('wiki:guides/parking')), 403, 'forbidden')
    })

    it('puts a source article on a checklist by its id', async () => {
      await asStaff()
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Wiki list', items: [{ articleId: 'wiki:guides/parking' }] }))
      expect(checklist.items[0]).toMatchObject({ articleId: 'wiki:guides/parking', article: { slug: 'wiki-parking', source: 'wiki' } })
    })

    it('searches every source', async () => {
      const hits = slugsOf(await listArticles(undefined, '?q=gate'))
      expect(hits).toContain('wiki-parking')
    })
  })

  describe('search', () => {
    it('finds articles by any word of the title or the text, in either language, ignoring case', async () => {
      const { article } = await publishedArticle({ grants: PUBLIC }, {
        title: both('Beer policy', 'Ølpolitik'),
        body: both('We pour **responsibly**.', 'Vi skænker ansvarligt.'),
      })
      for (const q of ['beer', 'BEER', 'ølpol', 'responsibly', 'skænker', 'ANSVARLIGT']) {
        expect(slugsOf(await listArticles(undefined, `?q=${encodeURIComponent(q)}`)), q).toContain(article.slug)
      }
      expect(slugsOf(await listArticles(undefined, '?q=nothingmatchesthis'))).toEqual([])
      expect((await json(undefined, 'GET', `${helpCenterApi.articles}?q=%20%20`)).status).toBe(400)
    })

    it('never finds what the viewer may not read, nor a draft', async () => {
      const marker = `zebra${++counter}`
      const restricted = await publishedArticle({ grants: SUPERVISORS }, { title: both(`Hidden ${marker}`, `Skjult ${marker}`) })
      const open = await publishedArticle({ grants: PUBLIC }, { title: both(`Seen ${marker}`, `Set ${marker}`) })
      const draft = await createArticle((await createCategory({ grants: PUBLIC })).id, { title: both(`Draft ${marker}`, `Kladde ${marker}`) })
      const member = await user('Member')
      const bar = await supervisor()
      expect(slugsOf(await listArticles(undefined, `?q=${marker}`))).toEqual([open.article.slug])
      expect(slugsOf(await listArticles(member.cookie, `?q=${marker}`))).toEqual([open.article.slug])
      expect(slugsOf(await listArticles(bar.cookie, `?q=${marker}`)).sort()).toEqual([open.article.slug, restricted.article.slug].sort())
      expect(slugsOf(await listArticles(bar.cookie, `?q=${marker}`))).not.toContain(draft.slug)
    })

    it('searches inside one category', async () => {
      const category = await createCategory({ grants: PUBLIC })
      const marker = `kiwi${++counter}`
      const inside = await publish((await createArticle(category.id, { title: both(`In ${marker}`, `I ${marker}`) })).id)
      await publishedArticle({ grants: PUBLIC }, { title: both(`Outside ${marker}`, `Udenfor ${marker}`) })
      expect(slugsOf(await listArticles(undefined, `?q=${marker}&category=${category.slug}`))).toEqual([inside.slug])
      expect(slugsOf(await listArticles(undefined, `?q=${marker}`))).toHaveLength(2)
    })
  })

  describe('reads and checklists', () => {
    it('records that a person read an article, once', async () => {
      const { article } = await publishedArticle()
      const member = await user('Reader')
      const first = await ok(await json(member.cookie, 'POST', helpCenterApi.me.reads, { articleId: article.id }))
      expect(first).toMatchObject({ articleId: article.id, readAt: expect.any(String) })
      const second = await ok(await json(member.cookie, 'POST', helpCenterApi.me.reads, { articleId: article.id }))
      expect(second.readAt).toBe(first.readAt)
    })

    it('refuses to record an article the person may not read, or one that does not exist: the same 404', async () => {
      const { article } = await publishedArticle({ grants: SUPERVISORS })
      const member = await user('Reader')
      const hidden = await json(member.cookie, 'POST', helpCenterApi.me.reads, { articleId: article.id })
      const missing = await json(member.cookie, 'POST', helpCenterApi.me.reads, { articleId: 'hlp_missing' })
      expect(hidden.status).toBe(404)
      expect(missing.status).toBe(404)
      expect(await hidden.json()).toMatchObject({ statusMessage: 'Help article not found.' })
      expect((await json(member.cookie, 'POST', helpCenterApi.me.reads, {})).status).toBe(400)
      // A draft cannot be read either.
      const draft = await createArticle((await createCategory({ grants: PUBLIC })).id)
      expect((await json(member.cookie, 'POST', helpCenterApi.me.reads, { articleId: draft.id })).status).toBe(404)
    })

    it('refuses a token without help-center:read (insufficient_scope)', async () => {
      const { article } = await publishedArticle({ grants: PUBLIC })
      await asStaff()
      const withManage = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.manage]) })
      await expectApiError(withManage.json('POST', helpCenterApi.me.reads, { articleId: article.id }), 403, 'insufficient_scope')
      await expectApiError(withManage.json('GET', helpCenterApi.me.checklists), 403, 'insufficient_scope')
      const withRead = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.read]) })
      expect(await withRead.json('POST', helpCenterApi.me.reads, { articleId: article.id })).toMatchObject({ articleId: article.id })
    })

    it('records an article of another source by its id', async () => {
      const member = await user('Reader')
      expect(await ok(await json(member.cookie, 'POST', helpCenterApi.me.reads, { articleId: 'wiki:guides/parking' }))).toMatchObject({ articleId: 'wiki:guides/parking' })
    })

    it('shows a checklist with the articles the person may read and which they have read', async () => {
      await asStaff()
      const open = await publishedArticle({ grants: PUBLIC })
      const optional = await publishedArticle({ grants: PUBLIC })
      const restricted = await publishedArticle({ grants: SUPERVISORS })
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, {
        grants: MEMBERS,
        name: both('Onboarding', 'Introduktion'),
        items: [{ articleId: open.article.id }, { articleId: optional.article.id, required: false }, { articleId: restricted.article.id }],
      }))
      expect(checklist).toMatchObject({ id: expect.stringMatching(/^hck_/), operationId: null, grants: MEMBERS })
      expect(checklist.items.map((item: Json) => [item.articleId, item.required])).toEqual([[open.article.id, true], [optional.article.id, false], [restricted.article.id, true]])
      expect(checklist.items[0].article).toMatchObject({ slug: open.article.slug })

      const member = await user('Volunteer')
      const bar = await supervisor()
      const mine = (await ok(await json(member.cookie, 'GET', helpCenterApi.me.checklists)) as unknown as Json[]).find(entry => entry.id === checklist.id)!
      // The restricted article is not there at all, as if it were not on the list.
      expect(mine.items.map((item: Json) => item.articleId)).toEqual([open.article.id, optional.article.id])
      expect(mine).toMatchObject({ readCount: 0, requiredCount: 1, requiredReadCount: 0, completed: false })
      expect(mine.items.every((item: Json) => item.read === false)).toBe(true)

      await ok(await json(member.cookie, 'POST', helpCenterApi.me.reads, { articleId: open.article.id }))
      const after = (await ok(await json(member.cookie, 'GET', helpCenterApi.me.checklists)) as unknown as Json[]).find(entry => entry.id === checklist.id)!
      expect(after).toMatchObject({ readCount: 1, requiredCount: 1, requiredReadCount: 1, completed: true })
      expect(after.items[0]).toMatchObject({ articleId: open.article.id, read: true, readAt: expect.any(String) })
      expect(after.items[1]).toMatchObject({ read: false, readAt: null })

      const barList = (await ok(await json(bar.cookie, 'GET', helpCenterApi.me.checklists)) as unknown as Json[]).find(entry => entry.id === checklist.id)!
      expect(barList.items).toHaveLength(3)
      expect(barList).toMatchObject({ requiredCount: 2, requiredReadCount: 0, completed: false })
    })

    it('shows a checklist of an operation, or with its own grants, to the people it is for', async () => {
      await asStaff()
      const { article } = await publishedArticle({ grants: PUBLIC })
      const items = [{ articleId: article.id }]
      const operation = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Operation list', operationId: 'opr_known', items }))
      const roleOnly = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { name: 'Bar list', grants: SUPERVISORS, items }))
      const outsider = await user('Outsider')
      const crew = await user('Crew')
      const bar = await supervisor()
      await takePart('opr_known', [crew.id])
      const ids = async (cookie: string) => (await ok(await json(cookie, 'GET', helpCenterApi.me.checklists)) as unknown as Json[]).map(entry => entry.id)
      expect(await ids(outsider.cookie)).not.toEqual(expect.arrayContaining([operation.id]))
      expect(await ids(crew.cookie)).toContain(operation.id)
      expect(await ids(crew.cookie)).not.toContain(roleOnly.id)
      expect(await ids(bar.cookie)).toContain(roleOnly.id)
      expect(await ids(outsider.cookie)).not.toContain(roleOnly.id)
    })

    it('leaves out a checklist with nothing the person may read', async () => {
      await asStaff()
      const restricted = await publishedArticle({ grants: SUPERVISORS })
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Bar only items', items: [{ articleId: restricted.article.id }] }))
      const member = await user('Member')
      expect((await ok(await json(member.cookie, 'GET', helpCenterApi.me.checklists)) as unknown as Json[]).map(entry => entry.id)).not.toContain(checklist.id)
    })

    it('edits the items of a checklist as a whole, in order, and refuses unknown or repeated articles', async () => {
      await asStaff()
      const a = await publishedArticle({ grants: PUBLIC })
      const b = await publishedArticle({ grants: PUBLIC })
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Order', items: [{ articleId: a.article.id }, { articleId: b.article.id }] }))
      const reordered = await ok(await json(staff.cookie, 'PATCH', helpCenterApi.admin.checklist(checklist.id), { items: [{ articleId: b.article.id }, { articleId: a.article.id, required: false }] }))
      expect(reordered.items.map((item: Json) => [item.articleId, item.required, item.sort])).toEqual([[b.article.id, true, 0], [a.article.id, false, 1]])
      expect((await json(staff.cookie, 'PATCH', helpCenterApi.admin.checklist(checklist.id), { items: [{ articleId: a.article.id }, { articleId: a.article.id }] })).status).toBe(400)
      expect((await json(staff.cookie, 'PATCH', helpCenterApi.admin.checklist(checklist.id), { items: [{ articleId: 'hlp_missing' }] })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Bad operation', operationId: 'opr_unknown' })).status).toBe(400)
      // The failed edits changed nothing.
      expect((await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.checklist(checklist.id)))).items).toHaveLength(2)
      const renamed = await ok(await json(staff.cookie, 'PATCH', helpCenterApi.admin.checklist(checklist.id), { name: both('Renamed', 'Omdøbt') }))
      expect(renamed).toMatchObject({ name: both('Renamed', 'Omdøbt') })
      expect(renamed.items).toHaveLength(2)
      expect(slugsOf((await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.checklists)) as unknown as Json[]).map(entry => ({ slug: entry.id })))).toContain(checklist.id)
      expect((await json(staff.cookie, 'DELETE', helpCenterApi.admin.checklist(checklist.id))).status).toBe(204)
      expect((await json(staff.cookie, 'GET', helpCenterApi.admin.checklist(checklist.id))).status).toBe(404)
    })

    it('drops a deleted article from checklists and from the record of reads', async () => {
      await asStaff()
      const keep = await publishedArticle({ grants: PUBLIC })
      const gone = await publishedArticle({ grants: PUBLIC })
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Shrinking', items: [{ articleId: keep.article.id }, { articleId: gone.article.id }] }))
      const reader = await user('Reader')
      await ok(await json(reader.cookie, 'POST', helpCenterApi.me.reads, { articleId: gone.article.id }))
      expect((await json(staff.cookie, 'DELETE', helpCenterApi.admin.article(gone.article.id))).status).toBe(204)
      const after = await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.checklist(checklist.id)))
      expect(after.items.map((item: Json) => item.articleId)).toEqual([keep.article.id])
      const progress = await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.progress(checklist.id)))
      expect(progress.items.map((row: Json) => row.user.id)).not.toContain(reader.id)
    })
  })

  describe('progress (help-center:pii)', () => {
    it('shows a coordinator who read what, the ones who have not finished first', async () => {
      await asStaff()
      const a = await publishedArticle({ grants: PUBLIC })
      const b = await publishedArticle({ grants: PUBLIC })
      const c = await publishedArticle({ grants: PUBLIC })
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, {
        grants: MEMBERS,
        name: 'Progress',
        items: [{ articleId: a.article.id }, { articleId: b.article.id }, { articleId: c.article.id, required: false }],
      }))
      const done = await registerUser('Done Person', `done${++counter}@example.com`)
      const partial = await registerUser('Partial Person', `partial${++counter}@example.com`)
      for (const id of [a.article.id, b.article.id, c.article.id]) await ok(await json(done.cookie, 'POST', helpCenterApi.me.reads, { articleId: id }))
      await ok(await json(partial.cookie, 'POST', helpCenterApi.me.reads, { articleId: a.article.id }))

      const progress = await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.progress(checklist.id)))
      expect(progress).toMatchObject({ total: 2, page: 1, requiredCount: 2, totalCount: 3 })
      expect(progress.items.map((row: Json) => row.user.id)).toEqual([partial.id, done.id])
      expect(progress.items[0]).toMatchObject({
        user: { id: partial.id, name: 'Partial Person', email: expect.stringContaining('partial') },
        readCount: 1,
        requiredReadCount: 1,
        completed: false,
        lastReadAt: expect.any(String),
      })
      expect(progress.items[1]).toMatchObject({ readCount: 3, requiredReadCount: 2, completed: true })

      const searched = await ok(await json(staff.cookie, 'GET', `${helpCenterApi.admin.progress(checklist.id)}?q=done%20person`))
      expect(searched.items.map((row: Json) => row.user.id)).toEqual([done.id])
      const paged = await ok(await json(staff.cookie, 'GET', `${helpCenterApi.admin.progress(checklist.id)}?pageSize=1&page=2`))
      expect(paged).toMatchObject({ total: 2, page: 2, pageSize: 1 })
      expect(paged.items).toHaveLength(1)
    })

    it('lists the people who take part in its operation (the operation grant\'s members), with nothing read yet', async () => {
      await asStaff()
      const { article } = await publishedArticle({ grants: PUBLIC })
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Operation progress', operationId: 'opr_progress', items: [{ articleId: article.id }] }))
      const started = await user('Started')
      const waiting = await user('Waiting')
      await takePart('opr_progress', [started.id, waiting.id])
      await ok(await json(started.cookie, 'POST', helpCenterApi.me.reads, { articleId: article.id }))
      const progress = await ok(await json(staff.cookie, 'GET', helpCenterApi.admin.progress(checklist.id)))
      expect(progress.items.map((row: Json) => [row.user.id, row.readCount, row.completed])).toEqual([[waiting.id, 0, false], [started.id, 1, true]])
    })

    it('needs help-center:pii: a token with manage but not pii is refused (insufficient_scope), one with pii is not', async () => {
      await asStaff()
      const checklist = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, { grants: MEMBERS, name: 'Scoped' }))
      const withManage = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.manage]) })
      await expectApiError(withManage.json('GET', helpCenterApi.admin.progress(checklist.id)), 403, 'insufficient_scope')
      const withPii = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.pii]) })
      expect(await withPii.json('GET', helpCenterApi.admin.progress(checklist.id))).toMatchObject({ total: 0, items: [] })
      // Seeing the checklist is not seeing who read it.
      const member = await user('Member')
      await expectApiError(json(member.cookie, 'GET', helpCenterApi.admin.progress(checklist.id)), 403, 'forbidden')
      expect((await json(staff.cookie, 'GET', helpCenterApi.admin.progress('hck_missing'))).status).toBe(404)
    })
  })

  describe('send', () => {
    const recipientEmails = (emails: Awaited<ReturnType<typeof getEmails>>, email: string) => emails.filter(mail => mail.to === email)

    it('emails people a link to each article they may read, the public area for a public one and the signed-in area otherwise', async () => {
      await asStaff()
      const open = await publishedArticle({ grants: PUBLIC })
      const internal = await publishedArticle()
      const member = await registerUser('Reader', `reader${++counter}@example.com`)
      const memberEmail = `reader${counter}@example.com`
      const result = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.send, {
        articleIds: [open.article.id, internal.article.id],
        audience: { userIds: [member.id] },
        channels: ['email'],
        locale: 'en',
      }))
      expect(result).toEqual({ recipients: 1, emailed: 1, texted: 0, skipped: 0 })
      const [mail] = recipientEmails(await getEmails(), memberEmail).slice(-1)
      expect(mail).toBeDefined()
      expect(mail!.subject).toBe('2 help articles')
      expect(mail!.body).toMatch(new RegExp(`href="http://[^"/]+/help/${open.category.slug}/${open.article.slug}"`))
      expect(mail!.body).toMatch(new RegExp(`href="http://[^"/]+/account/help/${internal.category.slug}/${internal.article.slug}"`))
      expect(mail!.template).toMatchObject({ name: 'help-center-articles' })
      expect(mail!.text).toContain(`/account/help/${internal.category.slug}/${internal.article.slug}`)
    })

    it('sends only what each person may read, and skips a person who may read none of it', async () => {
      await asStaff()
      const restricted = await publishedArticle({ grants: SUPERVISORS })
      const member = await registerUser('Plain', `plain${++counter}@example.com`)
      const bar = await registerUser('Bar', `bar${++counter}@bar.test`)
      const before = (await getEmails()).length
      const result = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.send, {
        articleIds: [restricted.article.id],
        audience: { userIds: [member.id, bar.id] },
        channels: ['email'],
      }))
      expect(result).toEqual({ recipients: 2, emailed: 1, texted: 0, skipped: 1 })
      const sent = (await getEmails()).slice(before)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.to).toBe(`bar${counter}@bar.test`)
      expect(sent[0]!.subject).toBe(restricted.article.title.da)
    })

    it('texts people who have a phone number', async () => {
      await asStaff()
      const { article, category } = await publishedArticle({ grants: PUBLIC })
      const withPhone = await user('Phone')
      const without = await user('Nophone')
      await setPhone(withPhone.id, '+4512345678')
      const before = (await getTexts()).length
      const result = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.send, {
        articleIds: [article.id],
        audience: { userIds: [withPhone.id, without.id] },
        channels: ['sms'],
      }))
      expect(result).toEqual({ recipients: 2, emailed: 0, texted: 1, skipped: 1 })
      const texts = (await getTexts()).slice(before)
      expect(texts).toHaveLength(1)
      expect(texts[0]).toMatchObject({ to: '+4512345678' })
      expect(texts[0]!.body).toContain(`/help/${category.slug}/${article.slug}`)
    })

    it('resolves grants through each kind\'s members, and merges them with explicit people', async () => {
      await asStaff()
      const { article } = await publishedArticle({ grants: PUBLIC })
      const fromGrant = await registerUser('Granted', `granted${++counter}@example.com`)
      const explicit = await registerUser('Explicit', `explicit${++counter}@example.com`)
      await takePart('opr_send', [fromGrant.id])
      const before = (await getEmails()).length
      const result = await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.send, {
        articleIds: [article.id],
        audience: { grants: operation('opr_send'), userIds: [explicit.id] },
        channels: ['email'],
      }))
      expect(result).toMatchObject({ recipients: 2, emailed: 2 })
      expect((await getEmails()).slice(before).map(mail => mail.to).sort()).toEqual([`explicit${counter}@example.com`, `granted${counter - 1}@example.com`].sort())
      // Grants that list nobody are said to, not reported as "sent to nobody".
      await expectApiError(json(staff.cookie, 'POST', helpCenterApi.admin.send, { articleIds: [article.id], audience: { grants: operation('opr_empty') }, channels: ['email'] }), 400, 'audience_not_resolved')
      // An unknown kind, a reference that does not exist, and `public` (which lists nobody) are refused.
      for (const grants of [[{ kind: 'galaxy' }], operation('opr_unknown'), PUBLIC]) {
        await expectApiError(json(staff.cookie, 'POST', helpCenterApi.admin.send, { articleIds: [article.id], audience: { grants }, channels: ['email'] }), 400, 'validation_failed')
      }
    })

    it('writes the subject in the language of the send', async () => {
      await asStaff()
      const a = await publishedArticle({ grants: PUBLIC }, { title: both('First guide', 'Første guide') })
      const b = await publishedArticle({ grants: PUBLIC }, { title: both('Second guide', 'Anden guide') })
      const person = await registerUser('Dansker', `dansker${++counter}@example.com`)
      const before = (await getEmails()).length
      await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.send, { articleIds: [a.article.id, b.article.id], audience: { userIds: [person.id] }, channels: ['email'], locale: 'da' }))
      const [mail] = (await getEmails()).slice(before)
      expect(mail!.subject).toBe('2 hjælpeartikler')
      expect(mail!.body).toContain('Første guide')
      expect(mail!.template).toMatchObject({ name: 'help-center-articles', locale: 'da' })
    })

    it('validates the request and needs help-center:send', async () => {
      await asStaff()
      const { article } = await publishedArticle({ grants: PUBLIC })
      const ok1 = { articleIds: [article.id], audience: { userIds: ['1'] }, channels: ['email'] }
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.send, { ...ok1, audience: {} })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.send, { ...ok1, channels: [] })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.send, { ...ok1, channels: ['push'] })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', helpCenterApi.admin.send, { ...ok1, articleIds: [] })).status).toBe(400)

      const withManage = apiClient({ bearer: await createToken(staff.cookie, [helpCenterAccess.permissions.manage]) })
      await expectApiError(withManage.json('POST', helpCenterApi.admin.send, ok1), 403, 'insufficient_scope')
      const member = await user('Member')
      await expectApiError(json(member.cookie, 'POST', helpCenterApi.admin.send, ok1), 403, 'forbidden')
    })
  })

  describe('pages', () => {
    const page = async (path: string, cookie?: string) => {
      const response = await fetch(path, { headers: cookie ? { cookie } : {} })
      return { status: response.status, html: await response.text() }
    }

    it('shows /help to everyone the same: public articles only, also to a signed-in person who may read more', async () => {
      const open = await publishedArticle({ grants: PUBLIC, name: both('Open Guides', 'Åbne guides') }, { title: both('Open article', 'Åben artikel') })
      const restricted = await publishedArticle({ grants: SUPERVISORS, name: both('Bar Secrets', 'Barens hemmeligheder') })
      const bar = await supervisor()
      const anonymous = await page('/help')
      const signedIn = await page('/help', bar.cookie)
      for (const { status, html } of [anonymous, signedIn]) {
        expect(status).toBe(200)
        expect(html).toContain('Open Guides')
        expect(html).toContain(`/help/${open.category.slug}`)
        expect(html).not.toContain('Bar Secrets')
        expect(html).not.toContain(restricted.category.slug)
        // The button into the signed-in area renders on the client only: the page is the same for every visitor.
        expect(html).not.toContain('data-test="help-center-cta"')
      }
      // Nothing in the page depends on who asks, so the HTML of the two is the same list.
      const categories = (html: string) => [...html.matchAll(/href="(\/help\/[^"]+)"/g)].map(match => match[1]).sort()
      expect(categories(signedIn.html)).toEqual(categories(anonymous.html))

      const category = await page(`/help/${open.category.slug}`)
      expect(category.status).toBe(200)
      expect(category.html).toContain('Open article')
      expect(category.html).toContain(`/help/${open.category.slug}/${open.article.slug}`)
      // A restricted category is not there for anyone on /help, a supervisor included: a 404 page.
      const hiddenCategory = await page(`/help/${restricted.category.slug}`, bar.cookie)
      expect(hiddenCategory.html).toContain('Category not found')
      expect(hiddenCategory.status).toBe(404)
    })

    it('renders a public article with its Markdown, JSON-LD for search engines, and no signed-in version', async () => {
      const { category, article } = await publishedArticle(
        { grants: PUBLIC },
        { title: both('Pour well', 'Skænk godt'), body: both('Always pour **carefully** & slowly.', 'Skænk altid **forsigtigt**.') },
      )
      const { status, html } = await page(`/help/${category.slug}/${article.slug}`)
      expect(status).toBe(200)
      expect(html).toContain('Pour well')
      expect(html).toMatch(/<strong>(?:<!--\[-->)?carefully(?:<!--\]-->)?<\/strong>/)
      const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/g)].map(match => match[1]!)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toContain('"@type":"Article"')
      expect(blocks[0]).toContain('Pour well')
      expect(blocks[0]).toContain('Always pour carefully & slowly.')
      expect(blocks[0]).not.toContain('**')
      // A link to the article's own category: another category in the address goes to the right one.
      const other = await createCategory({ grants: PUBLIC })
      const redirected = await fetch(`/help/${other.slug}/${article.slug}`, { redirect: 'manual' })
      expect(redirected.status).toBe(301)
      expect(redirected.headers.get('location')).toContain(`/help/${category.slug}/${article.slug}`)
    })

    it('does not render a restricted or a draft article in the public area', async () => {
      const restricted = await publishedArticle({ grants: SUPERVISORS }, { body: both('Secret recipe', 'Hemmelig opskrift') })
      const bar = await supervisor()
      for (const cookie of [undefined, bar.cookie]) {
        const { html, status } = await page(`/help/${restricted.category.slug}/${restricted.article.slug}`, cookie)
        expect(html).toContain('Article not found')
        expect(status).toBe(404)
        expect(html).not.toContain('Secret recipe')
        expect(html).not.toContain('application/ld+json')
      }
    })

    it('shows /account/help to a person only what their roles allow, with their checklist', async () => {
      await asStaff()
      const open = await publishedArticle({ grants: PUBLIC, name: both('Everyone Guides', 'Alles guider') }, { title: both('Everyone article', 'Alles artikel') })
      const restricted = await publishedArticle({ grants: SUPERVISORS, name: both('Bar Team Handbook', 'Bar-holdets håndbog') }, { title: both('Bar article', 'Bar-artikel') })
      await ok(await json(staff.cookie, 'POST', helpCenterApi.admin.checklists, {
        grants: MEMBERS,
        name: both('Your first week', 'Din første uge'),
        items: [{ articleId: open.article.id }, { articleId: restricted.article.id }],
      }))
      const member = await user('Member')
      const bar = await supervisor()

      const mine = await page('/account/help', member.cookie)
      expect(mine.status).toBe(200)
      expect(mine.html).toContain('Everyone Guides')
      expect(mine.html).not.toContain('Bar Team Handbook')
      expect(mine.html).toContain('Your first week')
      expect(mine.html).toContain('Everyone article')
      expect(mine.html).not.toContain('Bar article')
      expect(mine.html).not.toContain('data-test="help-center-cta"')

      const theirs = await page('/account/help', bar.cookie)
      expect(theirs.html).toContain('Bar Team Handbook')
      expect(theirs.html).toContain('Bar article')

      const notForMember = await page(`/account/help/${restricted.category.slug}/${restricted.article.slug}`, member.cookie)
      expect(notForMember.html).toContain('Article not found')
      expect(notForMember.status).toBe(404)
      const own = await page(`/account/help/${restricted.category.slug}/${restricted.article.slug}`, bar.cookie)
      expect(own.html).toContain('Bar article')
      // The signed-in version carries no JSON-LD: it is not for search engines.
      expect(own.html).not.toContain('application/ld+json')
    })

    it('shows the FAQ groups a category lists, for the people who may read each group', async () => {
      await asStaff()
      const group = (slug: string, grants: Json[], question: string) => async () => {
        const created = await ok(await json(staff.cookie, 'POST', faqApi.admin.groups, { slug, title: both(`Group ${slug}`, `Gruppe ${slug}`), grants }))
        const item = await ok(await json(staff.cookie, 'POST', faqApi.admin.items(created.id), { question: both(question, `${question} (da)`), answer: both('Because.', 'Fordi.') }))
        await ok(await json(staff.cookie, 'POST', faqApi.admin.publish(item.id)))
      }
      const suffix = ++counter
      await group(`pub-faq-${suffix}`, PUBLIC, `Public faq question ${suffix}`)()
      await group(`bar-faq-${suffix}`, SUPERVISORS, `Bar faq question ${suffix}`)()
      const { category } = await publishedArticle({ grants: PUBLIC, faqGroups: [`pub-faq-${suffix}`, `bar-faq-${suffix}`] })
      const bar = await supervisor()

      // The category lists only the FAQ groups faq would show the viewer: a restricted group's slug never reaches visitors.
      const listed = (cookie: string | undefined, query = '') => listCategories(cookie, query).then(categories => categories.find(entry => entry.slug === category.slug)?.faqGroups)
      expect(await listed(undefined)).toEqual([`pub-faq-${suffix}`])
      expect(await listed(bar.cookie, '?public=1')).toEqual([`pub-faq-${suffix}`])
      expect((await listed(bar.cookie))?.sort()).toEqual([`bar-faq-${suffix}`, `pub-faq-${suffix}`])
      expect((await ok(await json(undefined, 'GET', helpCenterApi.article((await publish((await createArticle(category.id)).id)).slug)))).category.faqGroups).toEqual([`pub-faq-${suffix}`])

      const visitor = await page(`/help/${category.slug}`)
      expect(visitor.html).toContain(`Public faq question ${suffix}`)
      expect(visitor.html).not.toContain(`Bar faq question ${suffix}`)
      // The public area is the same for a supervisor: it asks faq for what anonymous visitors read.
      expect((await page(`/help/${category.slug}`, bar.cookie)).html).not.toContain(`Bar faq question ${suffix}`)
      // The signed-in area asks as the person: faq's own grants decide.
      const inside = await page(`/account/help/${category.slug}`, bar.cookie)
      expect(inside.html).toContain(`Public faq question ${suffix}`)
      expect(inside.html).toContain(`Bar faq question ${suffix}`)
    })

    it('renders embedded FAQ components as what visitors read in the public area, and as the person in the signed-in one', async () => {
      await asStaff()
      const suffix = ++counter
      for (const [slug, grants, question] of [
        [`mdc-pub-${suffix}`, PUBLIC, `Embedded public ${suffix}`],
        [`mdc-bar-${suffix}`, SUPERVISORS, `Embedded bar ${suffix}`],
      ] as const) {
        const group = await ok(await json(staff.cookie, 'POST', faqApi.admin.groups, { slug, title: both(`Group ${slug}`, `Gruppe ${slug}`), grants }))
        const item = await ok(await json(staff.cookie, 'POST', faqApi.admin.items(group.id), { question: both(question, `${question} (da)`), answer: both('Because.', 'Fordi.') }))
        await ok(await json(staff.cookie, 'POST', faqApi.admin.publish(item.id)))
      }
      const body = `::faq{group="mdc-pub-${suffix}"}\n::\n\n::faq{group="mdc-bar-${suffix}"}\n::`
      const { category, article } = await publishedArticle({ grants: PUBLIC }, { body: both(body, body) })
      const bar = await supervisor()

      // `/help` is the same for everyone: the embedded groups are forced to what visitors read.
      for (const cookie of [undefined, bar.cookie]) {
        const { html } = await page(`/help/${category.slug}/${article.slug}`, cookie)
        expect(html).toContain(`Embedded public ${suffix}`)
        expect(html).not.toContain(`Embedded bar ${suffix}`)
      }
      const inside = await page(`/account/help/${category.slug}/${article.slug}`, bar.cookie)
      expect(inside.html).toContain(`Embedded public ${suffix}`)
      expect(inside.html).toContain(`Embedded bar ${suffix}`)
    })

    it('puts the areas where the options say, and nowhere else', async () => {
      expect((await page('/help')).status).toBe(200)
      expect((await page('/account/help', (await user('Member')).cookie)).status).toBe(200)
      expect((await page('/hjaelp')).status).toBe(404)
      expect((await page('/crew/help')).status).toBe(404)
    })

    it('opens the staff page for a coordinator', async () => {
      await asStaff()
      const { status, html } = await page('/admin/help-center', staff.cookie)
      expect(status).toBe(200)
      expect(html).toContain('Help center')
    })
  })
})
