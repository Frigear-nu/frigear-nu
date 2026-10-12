import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
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

describe('groups (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true })

  let staff: { cookie: string }
  let nobody: { cookie: string }
  beforeAll(async () => {
    staff = await registerUser('Staff', 'staff@staff.test')
    nobody = await registerUser('Nobody', 'nobody@example.com')
  })

  it('denies by default: anonymous 401, non-staff 403', async () => {
    expect((await json(undefined, 'GET', '/api/groups/admin/groups')).status).toBe(401)
    expect((await json(nobody.cookie, 'GET', '/api/groups/admin/groups')).status).toBe(403)
    expect((await json(nobody.cookie, 'POST', '/api/groups/admin/groups', { slug: 'x', name: 'X' })).status).toBe(403)
  })

  it('creates, updates and lists groups with localized names', async () => {
    const created = await ok(await json(staff.cookie, 'POST', '/api/groups/admin/groups', {
      slug: 'crew', name: { da: 'Mandskab', en: 'Crew' }, icon: 'i-lucide-users',
    }))
    expect(created.id).toMatch(/^grp_/)
    expect(created.name).toEqual({ da: 'Mandskab', en: 'Crew' })
    expect(created.memberCount).toBe(0)

    const duplicate = await json(staff.cookie, 'POST', '/api/groups/admin/groups', { slug: 'crew', name: 'Again' })
    expect(duplicate.status).toBe(409)
    const invalid = await json(staff.cookie, 'POST', '/api/groups/admin/groups', { slug: 'Bad Slug', name: 'Bad' })
    expect(invalid.status).toBe(400)

    const updated = await ok(await json(staff.cookie, 'PATCH', `/api/groups/admin/groups/${created.id}`, { description: 'Volunteers', icon: null }))
    expect(updated.description).toBe('Volunteers')
    expect(updated.icon).toBeNull()

    const list = await ok(await json(staff.cookie, 'GET', '/api/groups/admin/groups')) as unknown as Json[]
    expect(list.map(group => group.slug)).toContain('crew')
  })

  it('manages members and finds users to add', async () => {
    const group = await ok(await json(staff.cookie, 'POST', '/api/groups/admin/groups', { slug: 'members-test', name: 'Members' }))
    const found = await ok(await json(staff.cookie, 'GET', '/api/groups/admin/users?q=nobody')) as unknown as Json[]
    expect(found.map(user => user.email)).toEqual(['nobody@example.com'])

    await ok(await json(staff.cookie, 'POST', `/api/groups/admin/groups/${group.id}/members`, { userId: found[0]!.id }))
    // Adding twice is harmless.
    await ok(await json(staff.cookie, 'POST', `/api/groups/admin/groups/${group.id}/members`, { userId: found[0]!.id }))
    expect((await json(staff.cookie, 'POST', `/api/groups/admin/groups/${group.id}/members`, { userId: 99999 })).status).toBe(404)

    const members = await ok(await json(staff.cookie, 'GET', `/api/groups/admin/groups/${group.id}/members`)) as unknown as Json[]
    expect(members).toHaveLength(1)
    expect(members[0]!.email).toBe('nobody@example.com')
    expect((await ok(await json(staff.cookie, 'GET', `/api/groups/admin/groups/${group.id}`))).memberCount).toBe(1)

    await ok(await json(staff.cookie, 'DELETE', `/api/groups/admin/groups/${group.id}/members/${found[0]!.id}`))
    expect(await ok(await json(staff.cookie, 'GET', `/api/groups/admin/groups/${group.id}/members`))).toEqual([])
  })

  it('deletes a group with its memberships', async () => {
    const group = await ok(await json(staff.cookie, 'POST', '/api/groups/admin/groups', { slug: 'to-delete', name: 'Temp' }))
    await ok(await json(staff.cookie, 'DELETE', `/api/groups/admin/groups/${group.id}`))
    expect((await json(staff.cookie, 'GET', `/api/groups/admin/groups/${group.id}`)).status).toBe(404)
  })

  it('serves the admin pages', async () => {
    for (const path of ['/admin/groups', '/admin/groups/grp_x']) {
      const page = await fetch(path, { headers: { cookie: staff.cookie } })
      expect(page.status, (await page.clone().text()).slice(0, 3000)).toBe(200)
    }
  })
})
