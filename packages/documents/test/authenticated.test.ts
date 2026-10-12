import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { registerUser } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const json = (cookie: string | undefined, method: string, path: string, body?: unknown) => fetch(path, {
  method,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.status === 204 ? {} : response.json() as Promise<Json>
}
const upload = (cookie: string, content: string, type: string, name: string, meta: Json = {}) => {
  const body = new FormData()
  body.append('file', new File([content], name, { type }))
  body.append('meta', JSON.stringify(meta))
  return fetch('/api/documents/admin/items/upload', { method: 'POST', headers: { cookie }, body })
}
const list = async (cookie: string, parent?: string) =>
  (await ok(await json(cookie, 'GET', `/api/documents${parent ? `?parent=${parent}` : ''}`))) as { folder: Json | null, breadcrumb: Json[], items: Json[] }
const ids = (items: Json[]) => items.map(item => item.id)

describe('documents (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true })

  let staff: { cookie: string }
  let member: { cookie: string }
  let outsider: { cookie: string }
  let crew: Json
  beforeAll(async () => {
    staff = await registerUser('Staff', 'staff@staff.test')
    member = await registerUser('Member', 'member@example.com')
    outsider = await registerUser('Outsider', 'outsider@example.com')

    crew = await ok(await json(staff.cookie, 'POST', '/api/groups/admin/groups', { slug: 'crew', name: { da: 'Mandskab', en: 'Crew' } }))
    const [found] = await ok(await json(staff.cookie, 'GET', '/api/groups/admin/users?q=member@')) as unknown as Json[]
    await ok(await json(staff.cookie, 'POST', `/api/groups/admin/groups/${crew.id}/members`, { userId: found!.id }))
  })

  it('denies the manager API by default: anonymous 401, non-staff 403', async () => {
    expect((await json(undefined, 'GET', '/api/documents/admin/items')).status).toBe(401)
    expect((await json(outsider.cookie, 'GET', '/api/documents/admin/items')).status).toBe(403)
    expect((await upload(outsider.cookie, 'x', 'text/plain', 'x.txt')).status).toBe(403)
    expect((await json(undefined, 'GET', '/api/documents')).status).toBe(401)
  })

  it('validates uploads: type, size and file presence', async () => {
    expect((await upload(staff.cookie, '<b>x</b>', 'text/html', 'x.html')).status).toBe(415)
    expect((await upload(staff.cookie, 'x'.repeat(1001), 'text/plain', 'big.txt')).status).toBe(413)
    const empty = await fetch('/api/documents/admin/items/upload', { method: 'POST', headers: { cookie: staff.cookie }, body: new FormData() })
    expect(empty.status).toBe(400)
    expect((await upload(staff.cookie, 'x', 'text/plain', 'x.txt', { parentId: 'doc_missing' })).status).toBe(400)
  })

  it('shares files with groups, gates folders and serves downloads only to viewers', async () => {
    const folder = await ok(await json(staff.cookie, 'POST', '/api/documents/admin/items', {
      title: { da: 'Mandskabsmappe', en: 'Crew folder' }, icon: 'i-lucide-folder-lock', audience: 'groups', groupIds: [crew.id],
    }))
    expect(folder.kind).toBe('folder')
    expect(folder.groupIds).toEqual([crew.id])

    // `everyone`, but inside a folder only the crew may open: the folder gates it.
    const inside = await ok(await upload(staff.cookie, 'crew plan', 'text/plain', 'plan.txt', {
      parentId: folder.id, title: { da: 'Plan', en: 'Plan' }, audience: 'everyone',
    }))
    const open = await ok(await upload(staff.cookie, 'hello', 'text/plain', 'welcome.txt', { audience: 'everyone', description: 'For all' }))
    const unshared = await ok(await upload(staff.cookie, 'secret', 'text/plain', 'secret.txt'))
    expect(inside.pathname).toBeUndefined() // the blob pathname is never exposed

    const asMember = await list(member.cookie)
    expect(ids(asMember.items)).toEqual(expect.arrayContaining([folder.id, open.id]))
    expect(ids(asMember.items)).not.toContain(unshared.id)

    const asOutsider = await list(outsider.cookie)
    expect(ids(asOutsider.items)).toEqual([open.id])
    expect((await json(outsider.cookie, 'GET', `/api/documents?parent=${folder.id}`)).status).toBe(404)

    const opened = await list(member.cookie, folder.id)
    expect(ids(opened.items)).toEqual([inside.id])
    expect(ids(opened.breadcrumb)).toEqual([folder.id])
    // Users never see sharing details.
    expect(opened.items[0]).not.toHaveProperty('groupIds')

    const download = async (cookie: string, id: string) => json(cookie, 'GET', `/api/documents/${id}/download`)
    const served = await download(member.cookie, inside.id)
    expect(served.status).toBe(200)
    expect(await served.text()).toBe('crew plan')
    expect(served.headers.get('content-disposition')).toContain('attachment')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await download(outsider.cookie, inside.id)).status).toBe(404)
    expect((await download(member.cookie, unshared.id)).status).toBe(404)
    expect((await download(outsider.cookie, open.id)).status).toBe(200)
    expect((await download(member.cookie, folder.id)).status).toBe(404)

    // Managers see everything.
    expect(ids((await list(staff.cookie)).items)).toEqual(expect.arrayContaining([folder.id, open.id, unshared.id]))
  })

  it('updates sharing, moves items (not into themselves) and cleans up shares when a group is deleted', async () => {
    const a = await ok(await json(staff.cookie, 'POST', '/api/documents/admin/items', { title: 'A', audience: 'everyone' }))
    const b = await ok(await json(staff.cookie, 'POST', '/api/documents/admin/items', { title: 'B', parentId: a.id, audience: 'everyone' }))
    expect((await json(staff.cookie, 'PATCH', `/api/documents/admin/items/${a.id}`, { parentId: b.id })).status).toBe(400)
    expect((await json(staff.cookie, 'PATCH', `/api/documents/admin/items/${a.id}`, { parentId: a.id })).status).toBe(400)

    const temp = await ok(await json(staff.cookie, 'POST', '/api/groups/admin/groups', { slug: 'temp', name: 'Temp' }))
    const shared = await ok(await json(staff.cookie, 'PATCH', `/api/documents/admin/items/${b.id}`, { audience: 'groups', groupIds: [temp.id, 'grp_missing'] }))
    expect(shared.groupIds).toEqual([temp.id]) // unknown groups are ignored

    await ok(await json(staff.cookie, 'DELETE', `/api/groups/admin/groups/${temp.id}`))
    const adminListing = await ok(await json(staff.cookie, 'GET', `/api/documents/admin/items?parent=${a.id}`)) as unknown as { items: Json[] }
    expect(adminListing.items[0]!.groupIds).toEqual([])
  })

  it('deletes a folder with its contents', async () => {
    const folder = await ok(await json(staff.cookie, 'POST', '/api/documents/admin/items', { title: 'Temp folder', audience: 'everyone' }))
    const file = await ok(await upload(staff.cookie, 'bye', 'text/plain', 'bye.txt', { parentId: folder.id, audience: 'everyone' }))
    await ok(await json(staff.cookie, 'DELETE', `/api/documents/admin/items/${folder.id}`))
    expect((await json(staff.cookie, 'GET', `/api/documents/${file.id}/download`)).status).toBe(404)
    expect(ids((await list(staff.cookie)).items)).not.toContain(folder.id)
  })

  it('adds a Documents tile to the account page and serves the browse and admin pages', async () => {
    expect(await $fetch('/account')).toContain('Documents')
    const page = await fetch('/account/documents', { headers: { cookie: member.cookie } })
    expect(page.status, (await page.clone().text()).slice(0, 3000)).toBe(200)
    const admin = await fetch('/admin/documents', { headers: { cookie: staff.cookie } })
    expect(admin.status, (await admin.clone().text()).slice(0, 3000)).toBe(200)
  })
})
