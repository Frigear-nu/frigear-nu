import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { faqApi } from '../src/runtime/utils/api'
import { faqAccess } from '../src/runtime/access'
import { getHookLog, registerUser, setViewer } from './helpers'

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
let counter = 0

async function createToken(cookie: string, scopes: string[]) {
  return (await ok(await json(cookie, 'POST', authApi.me.tokens, { name: 'test', scopes }))).token as string
}

describe('faq (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: Session
  const user = async (name: string) => registerUser(name, `${name.toLowerCase()}${++counter}@example.com`)
  const barManager = async () => registerUser('Bar', `bar${++counter}@bar.test`)
  const asStaff = async () => (staff ??= await registerUser('Staff', 'staff@staff.test'))

  async function createGroup(overrides: Json = {}): Promise<Json> {
    await asStaff()
    return ok(await json(staff.cookie, 'POST', faqApi.admin.groups, {
      slug: `group-${++counter}`,
      title: both('Membership', 'Medlemskab'),
      ...overrides,
    }))
  }

  /** A draft item with both languages, so it can be published. */
  async function createItem(groupId: string, overrides: Json = {}): Promise<Json> {
    await asStaff()
    return ok(await json(staff.cookie, 'POST', faqApi.admin.items(groupId), {
      question: both(`Question ${++counter}?`, `Spørgsmål ${counter}?`),
      answer: both(`Answer ${counter}.`, `Svar ${counter}.`),
      ...overrides,
    }))
  }

  async function publish(itemId: string) {
    return ok(await json(staff.cookie, 'POST', faqApi.admin.publish(itemId)))
  }

  /** A group with published items, ready for the public API. */
  async function publishedGroup(groupOverrides: Json = {}, itemOverrides: Json[] = [{}]) {
    const group = await createGroup(groupOverrides)
    const items: Json[] = []
    for (const overrides of itemOverrides) items.push(await publish((await createItem(group.id, overrides)).id))
    return { group, items }
  }

  const listPublic = async (cookie: string | undefined, query = '') => await ok(await json(cookie, 'GET', `${faqApi.groups}${query}`)) as unknown as Json[]
  const slugsOf = (groups: Json[]) => groups.map(group => group.slug)

  describe('access', () => {
    it('denies the admin API by default: anonymous 401, non-staff 403', async () => {
      const nobody = await user('Nobody')
      expect((await json(undefined, 'GET', faqApi.admin.groups)).status).toBe(401)
      expect((await json(undefined, 'POST', faqApi.admin.groups, {})).status).toBe(401)
      await expectApiError(json(nobody.cookie, 'GET', faqApi.admin.groups), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', faqApi.admin.groups, { slug: 'x', title: 'X' }), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'GET', faqApi.admin.group('faq_missing')), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', faqApi.admin.publish('fqi_missing')), 403, 'forbidden')
    })

    it('answers 401 before 404 on the admin API', async () => {
      expect((await json(undefined, 'GET', faqApi.admin.group('faq_missing'))).status).toBe(401)
      expect((await json(undefined, 'PATCH', faqApi.admin.group('faq_missing'), {})).status).toBe(401)
      expect((await json(undefined, 'DELETE', faqApi.admin.group('faq_missing'))).status).toBe(401)
      expect((await json(undefined, 'GET', faqApi.admin.items('faq_missing'))).status).toBe(401)
      expect((await json(undefined, 'POST', faqApi.admin.reorder('faq_missing'), { itemIds: [] })).status).toBe(401)
      expect((await json(undefined, 'PATCH', faqApi.admin.item('fqi_missing'), {})).status).toBe(401)
      expect((await json(undefined, 'DELETE', faqApi.admin.item('fqi_missing'))).status).toBe(401)
      expect((await json(undefined, 'POST', faqApi.admin.unpublish('fqi_missing'))).status).toBe(401)
    })

    it('lets a staff token manage with the permission, and refuses one without (insufficient_scope)', async () => {
      await asStaff()
      const withManage = apiClient({ bearer: await createToken(staff.cookie, [faqAccess.permissions.manage]) })
      const created = await withManage.json<Json>('POST', faqApi.admin.groups, { slug: `token-${++counter}`, title: 'By token' })
      expect(created.id).toMatch(/^faq_/)
      expect(await withManage.json<Json>('GET', faqApi.admin.group(created.id))).toMatchObject({ id: created.id })

      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [faqAccess.permissions.read]) })
      await expectApiError(readOnly.json('GET', faqApi.admin.groups), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', faqApi.admin.groups, { slug: `nope-${++counter}`, title: 'No' }), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('PATCH', faqApi.admin.group(created.id), { icon: 'x' }), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('DELETE', faqApi.admin.group(created.id)), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', faqApi.admin.items(created.id), { question: 'Q', answer: 'A' }), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', faqApi.admin.reorder(created.id), { itemIds: [] }), 403, 'insufficient_scope')
    })

    it('refuses a read-only token on the item routes (insufficient_scope)', async () => {
      const group = await createGroup()
      const item = await createItem(group.id)
      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [faqAccess.permissions.read]) })
      await expectApiError(readOnly.json('PATCH', faqApi.admin.item(item.id), { icon: 'x' }), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('DELETE', faqApi.admin.item(item.id)), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', faqApi.admin.publish(item.id)), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', faqApi.admin.unpublish(item.id)), 403, 'insufficient_scope')
      expect(await ok(await json(staff.cookie, 'GET', faqApi.admin.items(group.id)))).toHaveLength(1)
    })

    it('lets a role holding faq:* manage the FAQ (the wildcard covers non-sensitive permissions)', async () => {
      const wild = await registerUser('Wild', `wild${++counter}@wild.test`)
      expect((await json(wild.cookie, 'GET', faqApi.admin.groups)).status).toBe(200)
    })
  })

  describe('admin: groups', () => {
    it('creates, reads, edits and deletes a group as a coordinator', async () => {
      const created = await createGroup({
        description: both('About membership', 'Om medlemskab'),
        icon: 'i-lucide-info',
        visibility: { public: true },
      })
      expect(created).toMatchObject({
        title: { en: 'Membership', da: 'Medlemskab' },
        icon: 'i-lucide-info',
        owner: { type: 'platform', id: null },
        visibility: { public: true },
        public: true,
        itemCount: 0,
        publishedCount: 0,
      })
      expect(created.id).toMatch(/^faq_/)
      expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false)

      expect(await ok(await json(staff.cookie, 'GET', faqApi.admin.group(created.id)))).toMatchObject({ slug: created.slug })

      const patched = await ok(await json(staff.cookie, 'PATCH', faqApi.admin.group(created.id), { title: 'Renamed', description: null, visibility: null }))
      expect(patched).toMatchObject({ title: 'Renamed', description: null, visibility: null, public: false, slug: created.slug })

      expect((await json(staff.cookie, 'DELETE', faqApi.admin.group(created.id))).status).toBe(204)
      await expectApiError(json(staff.cookie, 'GET', faqApi.admin.group(created.id)), 404, 'not_found')
    })

    it('keeps the groups in the order they were made, and lets `sort` change it', async () => {
      const marker = `ord${++counter}`
      const first = await createGroup({ slug: `${marker}-a` })
      const second = await createGroup({ slug: `${marker}-b` })
      expect(second.sort).toBeGreaterThan(first.sort)
      await ok(await json(staff.cookie, 'PATCH', faqApi.admin.group(second.id), { sort: first.sort - 1 < 0 ? 0 : first.sort - 1 }))
      const list = await ok(await json(staff.cookie, 'GET', `${faqApi.admin.groups}?q=${marker}`))
      expect(list.items.map((item: Json) => item.slug)).toContain(`${marker}-a`)
    })

    it('lists with paging, counts and a search over every language and the slug', async () => {
      const marker = `lst${++counter}`
      const a = await createGroup({ slug: `${marker}-alpha`, title: both(`Alpha ${marker}`, `Alfa ${marker}`) })
      const b = await createGroup({ slug: `${marker}-beta`, title: `Beta ${marker}` })
      await publish((await createItem(a.id)).id)
      await createItem(a.id)

      const search = await ok(await json(staff.cookie, 'GET', `${faqApi.admin.groups}?q=${marker}&sort=slug&order=asc`))
      expect(search.total).toBe(2)
      expect(search.items.map((item: Json) => item.id)).toEqual([a.id, b.id])
      expect(search.items[0]).toMatchObject({ itemCount: 2, publishedCount: 1 })
      expect(search.items[1]).toMatchObject({ itemCount: 0, publishedCount: 0 })

      const danish = await ok(await json(staff.cookie, 'GET', `${faqApi.admin.groups}?q=alfa ${marker}`))
      expect(danish.items.map((item: Json) => item.id)).toEqual([a.id])
      const bySlug = await ok(await json(staff.cookie, 'GET', `${faqApi.admin.groups}?q=${marker}-beta`))
      expect(bySlug.items.map((item: Json) => item.id)).toEqual([b.id])
      // The locale keys are never searched.
      expect((await ok(await json(staff.cookie, 'GET', `${faqApi.admin.groups}?q=zzz-${marker}`))).total).toBe(0)

      const page = await ok(await json(staff.cookie, 'GET', `${faqApi.admin.groups}?q=${marker}&pageSize=1&page=2&sort=slug&order=asc`))
      expect(page).toMatchObject({ total: 2, page: 2, pageSize: 1 })
      expect(page.items.map((item: Json) => item.id)).toEqual([b.id])
    })

    it('validates the body', async () => {
      await asStaff()
      const base = { title: 'Valid' }
      for (const body of [
        { ...base, slug: 'Not Valid' },
        { ...base, slug: 'search' },
        { ...base, slug: 'groups' },
        { ...base, slug: 'ok-slug', title: {} },
        { slug: 'ok-slug' },
        { ...base, slug: 'ok-slug', visibility: { permission: 'faq:manage' } },
        { ...base, slug: 'ok-slug', visibility: { globalRole: ['x'] } },
        { ...base, slug: 'ok-slug', sort: -1 },
      ]) {
        expect((await json(staff.cookie, 'POST', faqApi.admin.groups, body)).status, JSON.stringify(body)).toBe(400)
      }
    })

    it('refuses a visibility with an unknown key on a patch too, and keeps the stored one', async () => {
      const group = await createGroup({ visibility: { public: true } })
      expect((await json(staff.cookie, 'PATCH', faqApi.admin.group(group.id), { visibility: { permission: 'x' } })).status).toBe(400)
      expect(await ok(await json(staff.cookie, 'GET', faqApi.admin.group(group.id)))).toMatchObject({ visibility: { public: true } })
    })

    it('stores an empty visibility as null (signed-in people)', async () => {
      const group = await createGroup({ visibility: {} })
      expect(group.visibility).toBeNull()
    })

    it('keeps slugs unique (409 conflict), also when renaming', async () => {
      const a = await createGroup({ slug: `unique-${++counter}` })
      const b = await createGroup()
      await expectApiError(json(staff.cookie, 'POST', faqApi.admin.groups, { slug: a.slug, title: 'Again' }), 409, 'conflict')
      await expectApiError(json(staff.cookie, 'PATCH', faqApi.admin.group(b.id), { slug: a.slug }), 409, 'conflict')
      expect((await json(staff.cookie, 'PATCH', faqApi.admin.group(a.id), { slug: a.slug })).status).toBe(200)
    })

    it('deletes a group with its items', async () => {
      const group = await createGroup()
      const item = await createItem(group.id)
      expect((await json(staff.cookie, 'DELETE', faqApi.admin.group(group.id))).status).toBe(204)
      await expectApiError(json(staff.cookie, 'PATCH', faqApi.admin.item(item.id), { icon: 'x' }), 404, 'not_found')
    })

    it('checks the owner: the platform has no id, others must be answered by their module', async () => {
      await asStaff()
      const slug = () => `owner-${++counter}`
      expect(await ok(await json(staff.cookie, 'POST', faqApi.admin.groups, { slug: slug(), title: 'Op', owner: { type: 'operation', id: 'opr_known' } })))
        .toMatchObject({ owner: { type: 'operation', id: 'opr_known' } })
      expect(await ok(await json(staff.cookie, 'POST', faqApi.admin.groups, { slug: slug(), title: 'Team', owner: { type: 'team', id: 'tem_known' } })))
        .toMatchObject({ owner: { type: 'team', id: 'tem_known' } })
      expect(await ok(await json(staff.cookie, 'POST', faqApi.admin.groups, { slug: slug(), title: 'Plat', owner: { type: 'platform' } })))
        .toMatchObject({ owner: { type: 'platform', id: null } })

      for (const owner of [
        { type: 'operation', id: 'opr_unknown' },
        { type: 'operation' },
        { type: 'operation', id: null },
        { type: 'platform', id: 'x' },
        // Nobody answers for `user` here, so it cannot be verified.
        { type: 'user', id: '1' },
      ]) {
        expect((await json(staff.cookie, 'POST', faqApi.admin.groups, { slug: slug(), title: 'Bad', owner })).status, JSON.stringify(owner)).toBe(400)
      }
      const group = await createGroup()
      expect((await json(staff.cookie, 'PATCH', faqApi.admin.group(group.id), { owner: { type: 'operation', id: 'opr_unknown' } })).status).toBe(400)
      expect(await ok(await json(staff.cookie, 'PATCH', faqApi.admin.group(group.id), { owner: { type: 'operation', id: 'opr_known' } })))
        .toMatchObject({ owner: { type: 'operation', id: 'opr_known' } })
    })
  })

  describe('admin: items', () => {
    it('creates a draft at the end of the group, edits it, lists it and deletes it', async () => {
      const group = await createGroup()
      const first = await createItem(group.id, { icon: 'i-lucide-coins', links: [{ label: 'Prices', to: '/prices' }] })
      const second = await createItem(group.id)
      expect(first).toMatchObject({ groupId: group.id, status: 'draft', icon: 'i-lucide-coins', links: [{ label: 'Prices', to: '/prices' }], visibility: null, sort: 0 })
      expect(first.id).toMatch(/^fqi_/)
      expect(first.updatedBy).toBeTruthy()
      expect(second.sort).toBe(1)

      const patched = await ok(await json(staff.cookie, 'PATCH', faqApi.admin.item(first.id), { answer: both('New answer', 'Nyt svar'), links: [] }))
      expect(patched).toMatchObject({ answer: { en: 'New answer' }, links: [], status: 'draft' })

      const items = await ok(await json(staff.cookie, 'GET', faqApi.admin.items(group.id))) as unknown as Json[]
      expect(items.map(item => item.id)).toEqual([first.id, second.id])

      expect((await json(staff.cookie, 'DELETE', faqApi.admin.item(first.id))).status).toBe(204)
      expect((await ok(await json(staff.cookie, 'GET', faqApi.admin.items(group.id)))).map((item: Json) => item.id)).toEqual([second.id])
      expect(await ok(await json(staff.cookie, 'GET', faqApi.admin.group(group.id)))).toMatchObject({ itemCount: 1 })
    })

    it('validates the body and answers 404 for an unknown group or item', async () => {
      const group = await createGroup()
      for (const body of [
        {},
        { question: 'Q' },
        { answer: 'A' },
        { question: {}, answer: 'A' },
        { question: 'Q', answer: 'A', links: [{ label: 'x', to: 'javascript:alert(1)' }] },
        { question: 'Q', answer: 'A', visibility: { permission: 'faq:manage' } },
      ]) {
        expect((await json(staff.cookie, 'POST', faqApi.admin.items(group.id), body)).status, JSON.stringify(body)).toBe(400)
      }
      await expectApiError(json(staff.cookie, 'POST', faqApi.admin.items('faq_missing'), { question: 'Q', answer: 'A' }), 404, 'not_found')
      await expectApiError(json(staff.cookie, 'GET', faqApi.admin.items('faq_missing')), 404, 'not_found')
      await expectApiError(json(staff.cookie, 'PATCH', faqApi.admin.item('fqi_missing'), { icon: 'x' }), 404, 'not_found')
      await expectApiError(json(staff.cookie, 'DELETE', faqApi.admin.item('fqi_missing')), 404, 'not_found')
    })

    it('does not let a patch change the status or the group', async () => {
      const group = await createGroup()
      const other = await createGroup()
      const item = await createItem(group.id)
      const patched = await ok(await json(staff.cookie, 'PATCH', faqApi.admin.item(item.id), { status: 'published', groupId: other.id, icon: 'i-lucide-info' }))
      expect(patched).toMatchObject({ status: 'draft', groupId: group.id, icon: 'i-lucide-info' })
    })
  })

  describe('the publish rule', () => {
    it('refuses to publish an item missing a required language: 409 missing_translations with the languages', async () => {
      const group = await createGroup()
      const item = await createItem(group.id, { question: { en: 'Only English?' }, answer: { da: 'Kun dansk.', en: 'Both.' } })
      const body = await expectApiError(json(staff.cookie, 'POST', faqApi.admin.publish(item.id)), 409, 'missing_translations')
      expect(body.data).toMatchObject({ missing: [{ field: 'question', locales: ['da'] }] })
      expect(await ok(await json(staff.cookie, 'GET', faqApi.admin.items(group.id)))).toMatchObject([{ status: 'draft' }])

      const plain = await createItem(group.id, { question: 'Plain question?', answer: 'Plain answer.' })
      const plainBody = await expectApiError(json(staff.cookie, 'POST', faqApi.admin.publish(plain.id)), 409, 'missing_translations')
      expect(plainBody.data).toMatchObject({ missing: [{ field: 'question', locales: ['da', 'en'] }, { field: 'answer', locales: ['da', 'en'] }] })

      const fixed = await ok(await json(staff.cookie, 'PATCH', faqApi.admin.item(item.id), { question: both('Both?', 'Begge?') }))
      expect(fixed.status).toBe('draft')
      expect(await publish(item.id)).toMatchObject({ status: 'published' })
    })

    it('fires faq:item:published and faq:group:updated, and nothing for publishing twice', async () => {
      const group = await createGroup()
      const item = await createItem(group.id)
      await publish(item.id)
      const after = (await getHookLog()).filter(entry => entry.groupId === group.id)
      expect(after.map(entry => entry.name)).toEqual(['group:updated', 'group:updated', 'group:updated', 'item:published'])
      expect(after.find(entry => entry.name === 'item:published')).toMatchObject({ itemId: item.id })
      // The group of the last `group:updated` already counts the published item.
      expect(after.filter(entry => entry.name === 'group:updated').at(-1)?.publishedCount).toBe(1)

      await publish(item.id)
      expect((await getHookLog()).filter(entry => entry.groupId === group.id)).toHaveLength(after.length)
    })

    it('unpublishes an item back to a draft, and fires faq:group:updated', async () => {
      const { group, items } = await publishedGroup({ visibility: { public: true } })
      const before = (await getHookLog()).filter(entry => entry.groupId === group.id).length
      const draft = await ok(await json(staff.cookie, 'POST', faqApi.admin.unpublish(items[0]!.id)))
      expect(draft.status).toBe('draft')
      expect((await getHookLog()).filter(entry => entry.groupId === group.id)).toHaveLength(before + 1)
      expect((await listPublic(undefined, `?slugs=${group.slug}`))[0]!.items).toEqual([])
    })

    it('keeps a published item publishable: an edit that removes a language is refused', async () => {
      const { items } = await publishedGroup()
      await expectApiError(json(staff.cookie, 'PATCH', faqApi.admin.item(items[0]!.id), { question: { en: 'English only?' } }), 409, 'missing_translations')
      expect((await ok(await json(staff.cookie, 'PATCH', faqApi.admin.item(items[0]!.id), { question: both('Edited?', 'Redigeret?') }))).question).toEqual(both('Edited?', 'Redigeret?'))
    })

    it('fires faq:group:updated for group changes and deletes, and not for a patch that changes nothing', async () => {
      const group = await createGroup()
      const names = async () => (await getHookLog()).filter(entry => entry.groupId === group.id).map(entry => entry.name)
      expect(await names()).toEqual(['group:updated'])
      await ok(await json(staff.cookie, 'PATCH', faqApi.admin.group(group.id), { title: 'Changed' }))
      expect(await names()).toEqual(['group:updated', 'group:updated'])
      await ok(await json(staff.cookie, 'PATCH', faqApi.admin.group(group.id), { title: 'Changed' }))
      expect(await names()).toEqual(['group:updated', 'group:updated'])
      await json(staff.cookie, 'DELETE', faqApi.admin.group(group.id))
      expect(await names()).toEqual(['group:updated', 'group:updated', 'group:updated'])
    })
  })

  describe('reorder', () => {
    it('puts the items in the given order', async () => {
      const group = await createGroup()
      const a = await createItem(group.id)
      const b = await createItem(group.id)
      const c = await createItem(group.id)
      const reordered = await ok(await json(staff.cookie, 'POST', faqApi.admin.reorder(group.id), { itemIds: [c.id, a.id, b.id] })) as unknown as Json[]
      expect(reordered.map(item => item.id)).toEqual([c.id, a.id, b.id])
      expect((await ok(await json(staff.cookie, 'GET', faqApi.admin.items(group.id)))).map((item: Json) => item.id)).toEqual([c.id, a.id, b.id])
    })

    it('refuses an id set that is not exactly the group\'s: 400 invalid_order', async () => {
      const group = await createGroup()
      const other = await createGroup()
      const a = await createItem(group.id)
      const b = await createItem(group.id)
      const elsewhere = await createItem(other.id)

      for (const itemIds of [[a.id], [a.id, b.id, a.id], [a.id, b.id, 'fqi_missing'], [a.id, elsewhere.id], [a.id, b.id, elsewhere.id], []]) {
        const body = await expectApiError(json(staff.cookie, 'POST', faqApi.admin.reorder(group.id), { itemIds }), 400, 'invalid_order')
        expect(body.data).toHaveProperty('missing')
      }
      // Nothing moved, and the other group's item stayed where it was.
      expect((await ok(await json(staff.cookie, 'GET', faqApi.admin.items(group.id)))).map((item: Json) => item.id)).toEqual([a.id, b.id])
      expect((await ok(await json(staff.cookie, 'GET', faqApi.admin.items(other.id)))).map((item: Json) => item.id)).toEqual([elsewhere.id])
      expect((await json(staff.cookie, 'POST', faqApi.admin.reorder(group.id), { itemIds: 'nope' })).status).toBe(400)
      await expectApiError(json(staff.cookie, 'POST', faqApi.admin.reorder('faq_missing'), { itemIds: [] }), 404, 'not_found')
    })

    it('shows the new order to visitors', async () => {
      const { group, items } = await publishedGroup({ visibility: { public: true } }, [{}, {}])
      await ok(await json(staff.cookie, 'POST', faqApi.admin.reorder(group.id), { itemIds: [items[1]!.id, items[0]!.id] }))
      const [shown] = await listPublic(undefined, `?slugs=${group.slug}`)
      expect(shown!.items.map((item: Json) => item.id)).toEqual([items[1]!.id, items[0]!.id])
    })
  })

  describe('public API', () => {
    it('shows anonymous visitors public groups and public items only, and 404s the rest', async () => {
      const marker = `pub${++counter}`
      const open = await publishedGroup({ slug: `${marker}-open`, visibility: { public: true } })
      const signedIn = await publishedGroup({ slug: `${marker}-signed-in` })
      const draftOnly = await createGroup({ slug: `${marker}-drafts`, visibility: { public: true } })
      await createItem(draftOnly.id)

      const anonymous = await listPublic(undefined)
      expect(slugsOf(anonymous)).toContain(open.group.slug)
      expect(slugsOf(anonymous)).not.toContain(signedIn.group.slug)
      const shown = anonymous.find(group => group.slug === open.group.slug)!
      expect(shown.items.map((item: Json) => item.id)).toEqual([open.items[0]!.id])
      // Drafts never reach the public API: the group is there, without its draft.
      expect(anonymous.find(group => group.slug === draftOnly.slug)?.items).toEqual([])

      expect(await ok(await json(undefined, 'GET', faqApi.group(open.group.slug)))).toMatchObject({ id: open.group.id, public: true })
      await expectApiError(json(undefined, 'GET', faqApi.group(signedIn.group.slug)), 404, 'not_found')
      await expectApiError(json(undefined, 'GET', faqApi.group('does-not-exist')), 404, 'not_found')
    })

    it('answers with an allowlisted DTO: no status, visibility or audit data', async () => {
      const { group } = await publishedGroup({ visibility: { public: true } })
      const [shown] = await listPublic(undefined, `?slugs=${group.slug}`)
      expect(Object.keys(shown!).sort()).toEqual(['description', 'icon', 'id', 'items', 'owner', 'public', 'slug', 'sort', 'title'])
      expect(Object.keys(shown!.items[0]).sort()).toEqual(['answer', 'groupId', 'icon', 'id', 'links', 'public', 'question', 'sort'])
    })

    it('shows a signed-in user the signed-in groups as well', async () => {
      const marker = `sig${++counter}`
      const open = await publishedGroup({ slug: `${marker}-open`, visibility: { public: true } })
      const signedIn = await publishedGroup({ slug: `${marker}-signed`, visibility: null })
      const member = await user('Member')

      const mine = slugsOf(await listPublic(member.cookie))
      expect(mine).toContain(open.group.slug)
      expect(mine).toContain(signedIn.group.slug)
      expect(await ok(await json(member.cookie, 'GET', faqApi.group(signedIn.group.slug)))).toMatchObject({ id: signedIn.group.id, public: false })
    })

    it('filters by slugs, in the order asked for, and leaves out the ones that do not exist or are hidden', async () => {
      const marker = `slg${++counter}`
      const a = await publishedGroup({ slug: `${marker}-a`, visibility: { public: true } })
      const b = await publishedGroup({ slug: `${marker}-b`, visibility: { public: true } })
      const hidden = await publishedGroup({ slug: `${marker}-hidden`, visibility: { globalRoles: ['barmanager'] } })

      expect(slugsOf(await listPublic(undefined, `?slugs=${b.group.slug},${a.group.slug}`))).toEqual([b.group.slug, a.group.slug])
      expect(slugsOf(await listPublic(undefined, `?slugs=${a.group.slug},nope,${hidden.group.slug},${a.group.slug}`))).toEqual([a.group.slug])
    })

    it('hides a group restricted by role from everybody but that role, and shows it to the role', async () => {
      const marker = `rol${++counter}`
      const { group } = await publishedGroup({ slug: `${marker}-bar`, visibility: { globalRoles: ['barmanager'] } })
      const member = await user('Plain')
      const bar = await barManager()

      expect(slugsOf(await listPublic(undefined))).not.toContain(group.slug)
      expect(slugsOf(await listPublic(member.cookie))).not.toContain(group.slug)
      await expectApiError(json(member.cookie, 'GET', faqApi.group(group.slug)), 404, 'not_found')

      expect(slugsOf(await listPublic(bar.cookie))).toContain(group.slug)
      expect(await ok(await json(bar.cookie, 'GET', faqApi.group(group.slug)))).toMatchObject({ id: group.id, public: false })
    })

    it('lets an item narrow its group, and never widen it', async () => {
      const marker = `nar${++counter}`
      const open = await publishedGroup({ slug: `${marker}-open`, visibility: { public: true } }, [
        { question: both('For everyone?', 'Til alle?') },
        { question: both('For bar managers?', 'Til bar-managere?'), visibility: { globalRoles: ['barmanager'] } },
        { question: both('Inherits?', 'Arver?'), visibility: {} },
      ])
      const restricted = await publishedGroup({ slug: `${marker}-restricted`, visibility: { globalRoles: ['barmanager'] } }, [
        { question: both('Claims to be public?', 'Påstår at være offentlig?'), visibility: { public: true } },
      ])
      const member = await user('Narrow')
      const bar = await barManager()
      const questionsOf = (groups: Json[], slug: string) => groups.find(group => group.slug === slug)?.items.map((item: Json) => item.question.en)

      expect(questionsOf(await listPublic(undefined), open.group.slug)).toEqual(['For everyone?', 'Inherits?'])
      expect(questionsOf(await listPublic(member.cookie), open.group.slug)).toEqual(['For everyone?', 'Inherits?'])
      expect(questionsOf(await listPublic(bar.cookie), open.group.slug)).toEqual(['For everyone?', 'For bar managers?', 'Inherits?'])

      // A public item in a restricted group stays restricted.
      expect(questionsOf(await listPublic(undefined), restricted.group.slug)).toBeUndefined()
      expect(questionsOf(await listPublic(member.cookie), restricted.group.slug)).toBeUndefined()
      expect(questionsOf(await listPublic(bar.cookie), restricted.group.slug)).toEqual(['Claims to be public?'])
      // ...and says so: it is not public.
      expect((await listPublic(bar.cookie, `?slugs=${restricted.group.slug}`))[0]!.items[0]).toMatchObject({ public: false })
    })

    it('hides an item with a narrower visibility from visitors in a public group, also in a signed-in group', async () => {
      const group = await publishedGroup({ visibility: null }, [{ visibility: { public: true } }])
      expect((await listPublic(undefined, `?slugs=${group.group.slug}`))).toEqual([])
    })

    it('uses team roles and operations that audience:viewer:resolve fills in', async () => {
      const marker = `tem${++counter}`
      const baOnly = await publishedGroup({ slug: `${marker}-ba`, visibility: { minTeamRole: { kind: 'bar', role: 'ba' } } })
      const operationOnly = await publishedGroup({ slug: `${marker}-op`, visibility: { operationId: 'opr_known' } })
      const operationBa = await publishedGroup({ slug: `${marker}-op-ba`, visibility: { operationId: 'opr_known', minTeamRole: { kind: 'bar', role: 'ba' } } })

      const volunteer = await user('Volunteer')
      await setViewer(volunteer.cookie, {
        operationIds: ['opr_known'],
        teamRoles: [{ ownerType: 'operation', ownerId: 'opr_known', teamId: 'tem_1', kind: 'bar', role: 'volunteer', source: 'explicit' }],
      })
      const ba = await user('Ba')
      await setViewer(ba.cookie, {
        teamRoles: [{ ownerType: 'platform', ownerId: null, teamId: 'tem_2', kind: 'bar', role: 'ba', source: 'mapped' }],
      })
      const baAtOperation = await user('Baop')
      await setViewer(baAtOperation.cookie, {
        teamRoles: [{ ownerType: 'operation', ownerId: 'opr_known', teamId: 'tem_3', kind: 'bar', role: 'coordinator', source: 'explicit' }],
      })

      const visible = async (session: Session) => slugsOf(await listPublic(session.cookie)).filter(slug => slug.startsWith(marker))
      // Takes part in the operation, but only a volunteer on the bar ladder.
      expect(await visible(volunteer)).toEqual([operationOnly.group.slug])
      // A mapped BA role counts for a team role, but they do not take part in the operation.
      expect(await visible(ba)).toEqual([baOnly.group.slug])
      // An explicit grant on a team of the operation counts as taking part, and a coordinator is above BA.
      expect((await visible(baAtOperation)).sort()).toEqual([baOnly.group.slug, operationBa.group.slug, operationOnly.group.slug].sort())
      expect(await visible(await user('Nobody'))).toEqual([])
    })

    it('filters by operation', async () => {
      const marker = `opf${++counter}`
      const owned = await publishedGroup({ slug: `${marker}-owned`, visibility: { public: true }, owner: { type: 'operation', id: 'opr_known' } })
      const platform = await publishedGroup({ slug: `${marker}-platform`, visibility: { public: true } })

      const forOperation = slugsOf(await listPublic(undefined, '?operation=opr_known'))
      expect(forOperation).toContain(owned.group.slug)
      expect(forOperation).not.toContain(platform.group.slug)
      expect(await listPublic(undefined, '?operation=opr_other')).toEqual([])
    })

    it('answers public=1 for everyone alike, signed in or not, with a cacheable response', async () => {
      const marker = `p1${++counter}`
      const open = await publishedGroup({ slug: `${marker}-open`, visibility: { public: true } })
      const signedIn = await publishedGroup({ slug: `${marker}-signed` })
      const bar = await barManager()

      const anonymous = await listPublic(undefined, '?public=1')
      const asBar = await listPublic(bar.cookie, '?public=1')
      expect(slugsOf(anonymous)).toContain(open.group.slug)
      expect(slugsOf(anonymous)).not.toContain(signedIn.group.slug)
      expect(asBar).toEqual(anonymous)
      // Without the flag the signed-in user does see the signed-in group.
      expect(slugsOf(await listPublic(bar.cookie))).toContain(signedIn.group.slug)

      const response = await json(undefined, 'GET', `${faqApi.groups}?public=1`)
      expect(response.headers.get('cache-control')).toContain('public')
      const own = await json(bar.cookie, 'GET', faqApi.groups)
      expect(own.headers.get('cache-control')).toMatch(/private|no-store/)
    })

    it('treats a token without faq:read as anonymous', async () => {
      const marker = `tok${++counter}`
      const open = await publishedGroup({ slug: `${marker}-open`, visibility: { public: true } })
      const signedIn = await publishedGroup({ slug: `${marker}-signed` })
      const member = await user('Token')
      // A token that holds some other scope, but not `faq:read`.
      const scopes = await ok(await json(member.cookie, 'GET', authApi.scopes)) as unknown as Array<{ name: string }>
      const other = scopes.map(scope => scope.name).find(name => !name.startsWith('faq'))!
      const stranger = apiClient({ bearer: await createToken(member.cookie, [other]) })
      const reader = apiClient({ bearer: await createToken(member.cookie, [faqAccess.permissions.read]) })

      const strangerSlugs = slugsOf(await stranger.json<Json[]>('GET', faqApi.groups))
      expect(strangerSlugs).toContain(open.group.slug)
      expect(strangerSlugs).not.toContain(signedIn.group.slug)
      expect(slugsOf(await reader.json<Json[]>('GET', faqApi.groups))).toContain(signedIn.group.slug)
    })

    it('reads a slug that looks like a route word through the group route only: they are reserved', async () => {
      await asStaff()
      for (const slug of ['search', 'groups']) {
        expect((await json(staff.cookie, 'POST', faqApi.admin.groups, { slug, title: 'Reserved' })).status).toBe(400)
      }
    })
  })

  describe('search', () => {
    it('finds items by question or answer in either language, among the ones the viewer may read', async () => {
      const marker = `sea${++counter}`
      const open = await publishedGroup({ slug: `${marker}-open`, visibility: { public: true } }, [
        { question: both(`Where is the ${marker}wardrobe?`, `Hvor er ${marker}garderoben?`), answer: both('Behind the bar.', 'Bag baren.') },
        { question: both('Other?', 'Andet?'), answer: both(`See the ${marker}map.`, `Se ${marker}kortet.`) },
      ])
      const restricted = await publishedGroup({ slug: `${marker}-restricted`, visibility: { globalRoles: ['barmanager'] } }, [
        { question: both(`Secret ${marker}code?`, `Hemmelig ${marker}kode?`) },
      ])
      const draft = await createItem(open.group.id, { question: both(`Draft ${marker}?`, `Kladde ${marker}?`) })
      const bar = await barManager()
      const search = async (cookie: string | undefined, q: string, extra = '') =>
        await ok(await json(cookie, 'GET', `${faqApi.search}?q=${encodeURIComponent(q)}${extra}`)) as unknown as Json[]

      // English and Danish question, English and Danish answer.
      expect((await search(undefined, `${marker}wardrobe`)).map(hit => hit.item.id)).toEqual([open.items[0]!.id])
      expect((await search(undefined, `${marker}garderoben`)).map(hit => hit.item.id)).toEqual([open.items[0]!.id])
      expect((await search(undefined, `the ${marker}map`)).map(hit => hit.item.id)).toEqual([open.items[1]!.id])
      expect((await search(undefined, `Se ${marker}KORTET`)).map(hit => hit.item.id)).toEqual([open.items[1]!.id])
      expect((await search(undefined, `${marker}wardrobe`))[0]).toMatchObject({ group: { slug: open.group.slug } })

      // Restricted items only for the role, and drafts for nobody.
      expect(await search(undefined, `${marker}code`)).toEqual([])
      expect((await search(bar.cookie, `${marker}kode`)).map(hit => hit.item.id)).toEqual([restricted.items[0]!.id])
      expect(await search(staff.cookie, `Draft ${marker}`)).toEqual([])
      expect(draft.status).toBe('draft')

      // The locale keys are not searched, and a wildcard in the query matches literally.
      expect(await search(undefined, 'da')).not.toContainEqual(expect.objectContaining({ item: expect.objectContaining({ id: open.items[0]!.id }) }))
      expect(await search(undefined, '%')).toEqual([])
      // `public=1` is what visitors read, whoever asks.
      expect(await search(bar.cookie, `${marker}kode`, '&public=1')).toEqual([])
      // Narrowed to an operation.
      expect(await search(undefined, `${marker}wardrobe`, '&operation=opr_known')).toEqual([])
    })

    it('needs a search term', async () => {
      expect((await json(undefined, 'GET', faqApi.search)).status).toBe(400)
      expect((await json(undefined, 'GET', `${faqApi.search}?q=`)).status).toBe(400)
    })
  })

  describe('pages', () => {
    it('renders managed groups through Faq and FaqGrid, with their answers, and JSON-LD for public groups', async () => {
      const first = await publishedGroup({
        slug: 'page-managed',
        title: both('Page group title', 'Sidegruppens titel'),
        description: both('Page group description', 'Sidegruppens beskrivelse'),
        icon: 'i-lucide-info',
        visibility: { public: true },
      }, [
        { question: both('How does the page work?', 'Hvordan virker siden?'), answer: both('It renders **managed** content.', 'Den viser administreret indhold.'), links: [{ label: 'Read more', to: '/read-more' }] },
        { question: both('A restricted question?', 'Et begrænset spørgsmål?'), visibility: { globalRoles: ['barmanager'] } },
      ])
      await publishedGroup({ slug: 'page-second', title: both('Second group', 'Anden gruppe'), visibility: { public: true } }, [{ question: both('Second question?', 'Andet spørgsmål?') }])
      expect(first.group.slug).toBe('page-managed')

      const visitor = await (await fetch('/test/managed')).text()
      expect(visitor).toContain('Page group title')
      expect(visitor).toContain('Page group description')
      expect(visitor).toContain('How does the page work?')
      expect(visitor).toContain('It renders **managed** content.')
      expect(visitor).toContain('Read more')
      expect(visitor).toContain('href="/read-more"')
      expect(visitor).toContain('Second group')
      expect(visitor).toContain('Second question?')
      // Each of Faq, FaqGrid and FaqSectionList rendered its cards, in the order asked for.
      expect(visitor.indexOf('Page group title')).toBeLessThan(visitor.indexOf('Second group'))
      expect(visitor).not.toContain('A restricted question?')
      // FAQPage JSON-LD names the public questions only.
      const ld = /<script[^>]*application\/ld\+json[^>]*>(.*?)<\/script>/.exec(visitor)
      expect(ld, 'JSON-LD').not.toBeNull()
      expect(ld![1]).toContain('FAQPage')
      expect(ld![1]).toContain('How does the page work?')
      expect(ld![1]).not.toContain('A restricted question?')

      const bar = await barManager()
      expect(await (await fetch('/test/managed', { headers: { cookie: bar.cookie } })).text()).toContain('A restricted question?')
    }, 180_000)

    it('renders inline cards exactly as the website holds them, with the host\'s contact component', async () => {
      const html = await (await fetch('/test/inline')).text()
      expect(html).toContain('Inline card')
      expect(html).toContain('Written by hand.')
      expect(html).toContain('Inline question?')
      expect(html).toContain('Inline answer.')
      expect(html).toContain('First line')
      expect(html).toContain('Second line')
      expect(html).toContain('Inline link')
      expect(html).toContain('href="/somewhere"')
      // `contactComponent` names the component the card renders for `contact`, with its label and initial values.
      expect(html).toContain('data-test="test-contact"')
      expect(html).toContain('Contact: Write to us')
      expect(html).toContain('{&quot;subject&quot;:&quot;Hello&quot;}')
    }, 180_000)

    it('lets a custom page fetch with useFaq and render toFaqCardProps', async () => {
      await publishedGroup({ slug: 'page-custom', title: both('Custom group', 'Brugerdefineret gruppe'), visibility: { public: true } }, [
        { question: both('Custom question one?', 'Brugerdefineret spørgsmål et?') },
        { question: both('Custom question two?', 'Brugerdefineret spørgsmål to?') },
      ])
      const html = await (await fetch('/test/custom')).text()
      expect(html).toContain('success: 1 groups, 2 items')
      expect(html).toContain('Custom group')
      expect(html).toContain('Custom question one?')
      expect(html).toContain('Custom question two?')
    }, 180_000)

    it('does not leak a restricted group to the next visitor of the same page', async () => {
      const bar = await barManager()
      await publishedGroup({ slug: 'page-restricted-check', title: 'Restricted check', visibility: { globalRoles: ['barmanager'] } })
      // The pages above only name their own groups: this one is checked through the API, the way `useFaq` asks.
      expect(slugsOf(await listPublic(bar.cookie, '?slugs=page-restricted-check'))).toEqual(['page-restricted-check'])
      expect(await listPublic(undefined, '?slugs=page-restricted-check')).toEqual([])
    })

    it('renders the admin list and the group page with its items, settings and preview', async () => {
      const { group } = await publishedGroup({ title: both('Admin page group', 'Admin sidegruppe') }, [{ question: both('Admin page question?', 'Admin sidespørgsmål?') }])
      await createItem(group.id, { question: both('A draft question?', 'Et kladdespørgsmål?') })

      const list = await fetch('/admin/faq', { headers: { cookie: staff.cookie } })
      expect(list.status).toBe(200)
      expect(await list.text()).toContain('FAQ')

      const page = await fetch(`/admin/faq/${group.id}`, { headers: { cookie: staff.cookie } })
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('Admin page group')
      expect(html).toContain('Admin page question?')
      expect(html).toContain('A draft question?')
      expect(html).toContain('Settings')
      expect(html).toContain('Preview')
      expect(html).toContain('data-test="faq-items"')
      expect(html).toContain('data-test="faq-preview"')
    }, 180_000)

    it('keeps the admin pages behind the staff permission', async () => {
      const group = await createGroup({ title: 'Secret admin group' })
      const nobody = await user('Pagenobody')
      for (const path of ['/admin/faq', `/admin/faq/${group.id}`]) {
        const html = await (await fetch(path, { headers: { cookie: nobody.cookie } })).text()
        expect(html).toContain('You do not have access to the FAQ')
        expect(html).not.toContain('Secret admin group')
      }
    }, 180_000)
  })
})
