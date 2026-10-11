import { fileURLToPath } from 'node:url'
import { readFile, rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

const fixture = fileURLToPath(new URL('./fixtures/admin-db', import.meta.url))
const dataDir = `${fixture}/.data`
const mailFile = `${dataDir}/mails.jsonl`

async function sentMails(): Promise<{ to: string, subject: string }[]> {
  const raw = await readFile(mailFile, 'utf8').catch(() => '')
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  return fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function register(name: string, email: string) {
  const response = await call('POST', '/api/auth/register', { name, email, password: 'supersecret123' })
  expect(response.status, await response.clone().text()).toBe(200)
  return response.headers.get('set-cookie')!
}

describe('users admin', async () => {
  await rm(dataDir, { recursive: true, force: true })
  process.env.TEST_MAIL_FILE = mailFile
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir: fixture, dev: true })

  let staff: string
  let member: string

  it('is closed to guests and to users the host policy does not allow', async () => {
    staff = await register('Staff', 'staff@example.com')
    member = await register('Member', 'member@example.com')

    expect((await call('GET', '/api/users/admin')).status).toBe(401)
    expect((await call('GET', '/api/users/admin', undefined, member)).status).toBe(403)
    expect((await call('POST', '/api/users/admin', { name: 'X', email: 'x@example.com' }, member)).status).toBe(403)
    expect((await call('PATCH', '/api/users/admin/1', { name: 'X' }, member)).status).toBe(403)
  })

  it('lets allowed staff create, list and edit users without exposing passwords', async () => {
    const created = await call('POST', '/api/users/admin', { name: 'New Person', email: 'New@Example.com' }, staff)
    expect(created.status, await created.clone().text()).toBe(200)
    const user = await created.json()
    expect(user).toMatchObject({ name: 'New Person', email: 'new@example.com', emailVerifiedAt: null })
    expect(user).not.toHaveProperty('password')

    // A sign-in link was emailed to the new user.
    expect((await sentMails()).some(mail => mail.to === 'new@example.com')).toBe(true)

    const { items: list } = await (await call('GET', '/api/users/admin', undefined, staff)).json()
    expect(list.map((u: { email: string }) => u.email)).toContain('new@example.com')
    expect(list.every((u: object) => !('password' in u))).toBe(true)

    const edited = await call('PATCH', `/api/users/admin/${user.id}`, { name: 'Renamed' }, staff)
    expect(edited.status, await edited.clone().text()).toBe(200)
    expect(await edited.json()).toMatchObject({ name: 'Renamed' })

    const members = await (await call('GET', '/api/users/admin/new-members', undefined, staff)).json()
    expect(members.length).toBeGreaterThan(0)
  })

  it('rejects duplicate emails and unknown users', async () => {
    expect((await call('POST', '/api/users/admin', { name: 'Dup', email: 'member@example.com' }, staff)).status).toBe(409)
    expect((await call('PATCH', '/api/users/admin/99999', { name: 'Ghost' }, staff)).status).toBe(404)
    expect((await call('PATCH', '/api/users/admin/abc', { name: 'Ghost' }, staff)).status).toBe(400)
  })

  it('marks a staff-changed email as unverified', async () => {
    const { items: list } = await (await call('GET', '/api/users/admin', undefined, staff)).json()
    const target = list.find((u: { email: string }) => u.email === 'member@example.com')
    const edited = await call('PATCH', `/api/users/admin/${target.id}`, { email: 'member2@example.com' }, staff)
    expect(await edited.json()).toMatchObject({ email: 'member2@example.com', emailVerifiedAt: null })
  })

  it('paginates, searches, filters and sorts through the API', async () => {
    const fetchPage = async (query: string) => (await call('GET', `/api/users/admin?${query}`, undefined, staff)).json()

    const first = await fetchPage('pageSize=1&sort=id&order=asc')
    expect(first.items).toHaveLength(1)
    expect(first.total).toBeGreaterThanOrEqual(3)
    expect(first.pageSize).toBe(1)

    const second = await fetchPage('pageSize=1&page=2&sort=id&order=asc')
    expect(second.items[0].id).toBeGreaterThan(first.items[0].id)

    const search = await fetchPage('q=renamed')
    expect(search.total).toBe(1)
    expect(search.items[0].name).toBe('Renamed')

    // LIKE wildcards are matched literally.
    expect((await fetchPage('q=%25')).total).toBe(0)

    const unverified = await fetchPage('verified=false&pageSize=100')
    expect(unverified.items.every((u: { emailVerifiedAt: unknown }) => u.emailVerifiedAt === null)).toBe(true)

    const sorted = await fetchPage('sort=email&order=asc&pageSize=100')
    const emails = sorted.items.map((u: { email: string }) => u.email)
    expect(emails).toEqual([...emails].sort())

    expect((await call('GET', '/api/users/admin?pageSize=1000', undefined, staff)).status).toBe(400)
  })
})
