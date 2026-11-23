import { fileURLToPath } from 'node:url'
import { readFile, rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError, fixtureSqlite, reindexOf, runSearchReindex } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { adminApi } from '@frigear-nu/admin/api'
import type { AdminSearchReindexDto } from '@frigear-nu/admin/api'
import { usersApi } from '../src/runtime/utils/api'
import type { AdminUserDto } from '../src/types'

const fixture = fileURLToPath(new URL('./fixtures/admin-db', import.meta.url))
const dataDir = `${fixture}/.data`
const mailFile = `${dataDir}/mails.jsonl`

type Row = AdminUserDto & { subscription?: unknown }
type Page = { items: Row[], total: number, page: number, pageSize: number }

async function sentMails(): Promise<{ to: string, subject: string }[]> {
  const raw = await readFile(mailFile, 'utf8').catch(() => '')
  return raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
}

async function register(name: string, email: string) {
  const response = await apiClient().fetch('POST', authApi.register, { name, email, password: 'supersecret123' })
  expect(response.status, await response.clone().text()).toBe(201)
  return response.headers.get('set-cookie')!.split(';')[0]!
}

async function registerAndGetCookie(payload: { name: string, email: string, password: string }) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  expect(response.status, await response.text()).toBe(201)
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie after registering.')
  return cookie
}

async function mcpRegister(name: string, email: string) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return response.headers.get('set-cookie')!
}

async function mcpRpc(cookie: string | undefined, method: string, params: Json = {}) {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await response.text()
  const payload = text.trimStart().startsWith('{') ? text : text.split('\n').find(line => line.startsWith('data:'))?.slice(5) ?? '{}'
  return JSON.parse(payload) as { result?: Json, error?: Json }
}

// One database-backed app for every suite below: the admin area, the self-service routes (with MCP) and the bare module.
await rm(dataDir, { recursive: true, force: true })
process.env.TEST_MAIL_FILE = mailFile
afterAll(() => rm(dataDir, { recursive: true, force: true }))

// Dev mode lets NuxtHub apply the committed sqlite migrations on startup.
await setup({ rootDir: fixture, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

describe('users admin', () => {
  const anonymous = apiClient()
  let staff: ReturnType<typeof apiClient>
  let member: ReturnType<typeof apiClient>
  let memberId: number

  it('is closed to guests and to users without the permissions', async () => {
    staff = apiClient({ cookie: await register('Staff', 'staff@example.com') })
    member = apiClient({ cookie: await register('Member', 'member@example.com') })

    await expectApiError(anonymous.json('GET', usersApi.admin.users), 401)
    await expectApiError(member.json('GET', usersApi.admin.users), 403, 'forbidden')
    await expectApiError(member.json('POST', usersApi.admin.users, { name: 'X', email: 'x@example.com' }), 403, 'forbidden')
    await expectApiError(member.json('PATCH', usersApi.admin.user(1), { name: 'X' }), 403, 'forbidden')
  })

  it('authorizes before it looks up the user: 401/403 even for unknown or malformed ids', async () => {
    for (const id of [99999, 'abc']) {
      await expectApiError(anonymous.json('GET', usersApi.admin.user(id)), 401)
      await expectApiError(member.json('GET', usersApi.admin.user(id)), 403, 'forbidden')
      await expectApiError(member.json('PATCH', usersApi.admin.user(id), { name: 'Ghost' }), 403, 'forbidden')
      await expectApiError(member.json('DELETE', usersApi.admin.user(id)), 403, 'forbidden')
      await expectApiError(member.json('POST', usersApi.admin.resend(id)), 403, 'forbidden')
    }
    // An invalid body is not looked at before the caller is allowed.
    await expectApiError(member.json('POST', usersApi.admin.users, { email: 'not-an-email' }), 403, 'forbidden')
  })

  it('lets allowed staff create (201), list and edit users through DTOs', async () => {
    const created = await staff.fetch('POST', usersApi.admin.users, { name: 'New Person', email: '  New@Example.com ' })
    expect(created.status, await created.clone().text()).toBe(201)
    const user = await created.json() as Row
    expect(user).toMatchObject({ name: 'New Person', email: 'new@example.com', emailVerifiedAt: null, avatar: null })
    // The admin holds `users:pii`, so the (unset) phone number is in the answer.
    expect(Object.keys(user).sort()).toEqual(['avatar', 'createdAt', 'email', 'emailVerifiedAt', 'id', 'lastLoginAt', 'name', 'phone'])

    // A sign-in link was emailed to the new user.
    expect((await sentMails()).some(mail => mail.to === 'new@example.com')).toBe(true)

    const { items: list } = await staff.json<Page>('GET', usersApi.admin.users)
    expect(list.map(u => u.email)).toContain('new@example.com')
    expect(list.every(u => !('password' in u))).toBe(true)
    memberId = list.find(u => u.email === 'member@example.com')!.id

    const edited = await staff.json<Row>('PATCH', usersApi.admin.user(user.id), { name: 'Renamed' })
    expect(edited).toMatchObject({ name: 'Renamed' })
    expect(edited).not.toHaveProperty('password')

    const users = await staff.json<Row[]>('GET', usersApi.admin.new)
    expect(users.length).toBeGreaterThan(0)
    expect(users.every(u => !('password' in u))).toBe(true)
  })

  it('validates names and rejects unknown users', async () => {
    await expectApiError(staff.json('POST', usersApi.admin.users, { name: 'x'.repeat(121), email: 'long@example.com' }), 400)
    await expectApiError(staff.json('PATCH', usersApi.admin.user(99999), { name: 'Ghost' }), 404, 'not_found')
    await expectApiError(staff.json('PATCH', usersApi.admin.user('abc'), { name: 'Ghost' }), 400)
  })

  it('rejects duplicate emails whatever their case', async () => {
    await expectApiError(staff.json('POST', usersApi.admin.users, { name: 'Dup', email: 'member@example.com' }), 409, 'conflict')
    await expectApiError(staff.json('POST', usersApi.admin.users, { name: 'Dup', email: 'MEMBER@Example.com' }), 409, 'conflict')
    const other = await staff.json<Row>('POST', usersApi.admin.users, { name: 'Other', email: 'other@example.com', sendWelcomeEmail: false })
    await expectApiError(staff.json('PATCH', usersApi.admin.user(other.id), { email: 'Member@Example.COM' }), 409, 'conflict')

    // A row stored before emails were normalised still blocks its address, in any case.
    const legacy = await apiClient().json<{ id: number }>('POST', '/api/test/legacy-user', { name: 'Legacy', email: 'Legacy@Example.com', password: 'supersecret123' })
    await expectApiError(staff.json('POST', usersApi.admin.users, { name: 'Dup', email: 'legacy@example.com' }), 409, 'conflict')
    await expectApiError(staff.json('PATCH', usersApi.admin.user(other.id), { email: 'LEGACY@example.com' }), 409, 'conflict')
    // Its owner may re-save the same address in another case: not a change, so no conflict and no re-verification.
    const before = (await sentMails()).length
    expect(await staff.json<Row>('PATCH', usersApi.admin.user(legacy.id), { email: 'legacy@example.com' }))
      .toMatchObject({ email: 'Legacy@Example.com' })
    expect((await sentMails()).length).toBe(before)
  })

  it('signs in with an email in any case (users store lookups are case-insensitive)', async () => {
    const response = await apiClient().fetch('POST', authApi.register, { name: 'Ada', email: 'Ada@Example.com', password: 'supersecret123' })
    expect(response.status, await response.clone().text()).toBe(201)

    for (const email of ['ada@example.com', 'ADA@EXAMPLE.COM']) {
      const login = await apiClient().fetch('POST', authApi.login, { email, password: 'supersecret123' })
      expect(login.status, await login.clone().text()).toBe(200)
    }

    await apiClient().json('POST', '/api/test/legacy-user', { name: 'Mixed', email: 'Mixed.Case@Example.com', password: 'supersecret123' })
    const legacyLogin = await apiClient().fetch('POST', authApi.login, { email: 'mixed.case@example.com', password: 'supersecret123' })
    expect(legacyLogin.status, await legacyLogin.clone().text()).toBe(200)
  })

  it('marks a staff-changed email as unverified', async () => {
    const edited = await staff.json<Row>('PATCH', usersApi.admin.user(memberId), { email: 'Member2@Example.com' })
    expect(edited).toMatchObject({ email: 'member2@example.com', emailVerifiedAt: null })

    // The member's session named the old address, so it ended; they sign in with the new one.
    await expectApiError(member.json('GET', usersApi.admin.stats), 401)
    const login = await apiClient().fetch('POST', authApi.login, { email: 'member2@example.com', password: 'supersecret123' })
    expect(login.status, await login.clone().text()).toBe(200)
    member = apiClient({ cookie: login.headers.get('set-cookie')!.split(';')[0]! })
  })

  it('paginates, searches, filters and sorts through the API', async () => {
    const fetchPage = (query: string) => staff.json<Page>('GET', `${usersApi.admin.users}?${query}`)

    const first = await fetchPage('pageSize=1&sort=id&order=asc')
    expect(first.items).toHaveLength(1)
    expect(first.total).toBeGreaterThanOrEqual(3)
    expect(first.pageSize).toBe(1)

    const second = await fetchPage('pageSize=1&page=2&sort=id&order=asc')
    expect(second.items[0]!.id).toBeGreaterThan(first.items[0]!.id)

    const search = await fetchPage('q=renamed')
    expect(search.total).toBe(1)
    expect(search.items[0]!.name).toBe('Renamed')

    // LIKE wildcards are matched literally.
    expect((await fetchPage('q=%25')).total).toBe(0)

    const unverified = await fetchPage('verified=false&pageSize=100')
    expect(unverified.items.every(u => u.emailVerifiedAt === null)).toBe(true)

    const sorted = await fetchPage('sort=email&order=asc&pageSize=100')
    const emails = sorted.items.map(u => u.email)
    expect(emails).toEqual([...emails].sort())

    await expectApiError(fetchPage('pageSize=1000'), 400)
  })

  it('reports the dashboard stats to staff only', async () => {
    await expectApiError(anonymous.json('GET', usersApi.admin.stats), 401)
    await expectApiError(member.json('GET', usersApi.admin.stats), 403)
    const { items, total } = await staff.json<Page>('GET', `${usersApi.admin.users}?pageSize=1`)
    expect(items).toHaveLength(1)
    const stats = await staff.json<{ total: number, newUsers: number, days: number }>('GET', usersApi.admin.stats)
    // Everyone here signed up just now.
    expect(stats).toEqual({ total, newUsers: total, days: 30 })
  })

  it('shows a user with passkeys count and permissions, and resends the sign-in link', async () => {
    const { items } = await staff.json<Page>('GET', `${usersApi.admin.users}?q=staff`)
    expect(items[0]).toHaveProperty('subscription', null)

    const detail = await staff.json<Record<string, unknown>>('GET', usersApi.admin.user(items[0]!.id))
    expect(detail).toMatchObject({ email: 'staff@example.com', passkeys: 0, hasPassword: true, subscription: null })
    expect(detail).not.toHaveProperty('password')
    // Deleting yourself is never offered. The admin holds `users:pii` by name (`grantTo`), so the phone is there.
    expect(detail.can).toEqual({ update: true, delete: false, manage: true, pii: true })
    expect(detail).toHaveProperty('phone', null)

    await expectApiError(member.json('GET', usersApi.admin.user(items[0]!.id)), 403)
    await expectApiError(staff.json('GET', usersApi.admin.user(99999)), 404, 'not_found')

    const before = (await sentMails()).length
    expect(await staff.json('POST', usersApi.admin.resend(items[0]!.id))).toEqual({ ok: true })
    expect((await sentMails()).length).toBe(before + 1)
  })

  it('emails a verification link after an admin changes the address and can verify directly', async () => {
    const created = await staff.json<Row>('POST', usersApi.admin.users, { name: 'Mover', email: 'mover@example.com', sendWelcomeEmail: false })
    const before = (await sentMails()).length

    const moved = await staff.json<Row>('PATCH', usersApi.admin.user(created.id), { email: 'moved@example.com' })
    expect(moved).toMatchObject({ email: 'moved@example.com', emailVerifiedAt: null })
    const mails = await sentMails()
    expect(mails.length).toBe(before + 1)
    expect(mails.at(-1)!.to).toBe('moved@example.com')

    const verified = await staff.json<Row>('PATCH', usersApi.admin.user(created.id), { emailVerified: true })
    expect(verified.emailVerifiedAt).not.toBeNull()
    const unverified = await staff.json<Row>('PATCH', usersApi.admin.user(created.id), { emailVerified: false })
    expect(unverified.emailVerifiedAt).toBeNull()
  })

  it('renders the list with a row menu and the detail page with a breadcrumb', async () => {
    const page = async (path: string) => {
      const response = await staff.fetch('GET', path)
      expect(response.status, path).toBe(200)
      return response.text()
    }

    const list = await page('/admin/users')
    expect(list).toContain('Add user')
    // One `RowMenu` per row, named after its user.
    expect(list).toContain('aria-label="Actions for Staff"')
    expect(list).toContain('staff@example.com')

    const { items } = await staff.json<Page>('GET', `${usersApi.admin.users}?q=staff`)
    const detail = await page(`/admin/users/${items[0]!.id}`)
    expect(detail).toMatch(/<nav[^>]*aria-label="breadcrumb"/i)
    expect(detail).toMatch(/<h1[^>]*>(?:<!--\[-->)?Staff/)
    expect(detail).toContain('aria-label="Actions for Staff"')

    expect(await page('/admin/users/99999')).toContain('User not found')
  }, 120_000)

  it('deletes users (204) with the permission but never the acting user', async () => {
    const created = await staff.json<Row>('POST', usersApi.admin.users, { name: 'Gone', email: 'gone@example.com', sendWelcomeEmail: false })
    await expectApiError(member.json('DELETE', usersApi.admin.user(created.id)), 403)
    const deleted = await staff.fetch('DELETE', usersApi.admin.user(created.id))
    expect(deleted.status).toBe(204)
    expect(await deleted.text()).toBe('')
    await expectApiError(staff.json('GET', usersApi.admin.user(created.id)), 404)
    await expectApiError(staff.json('DELETE', usersApi.admin.user(99999)), 404)

    const { items } = await staff.json<Page>('GET', `${usersApi.admin.users}?q=staff`)
    await expectApiError(staff.json('DELETE', usersApi.admin.user(items[0]!.id)), 400)
  })

  describe('target protection', () => {
    let coordinator: ReturnType<typeof apiClient>
    let staffId: number

    it('lets a coordinator (users:* only) manage users who hold nothing more than they do', async () => {
      coordinator = apiClient({ cookie: await register('Coordinator', 'coordinator@example.com') })
      const { items } = await coordinator.json<Page>('GET', `${usersApi.admin.users}?pageSize=100`)
      staffId = items.find(u => u.email === 'staff@example.com')!.id

      const plain = await coordinator.json<Row>('POST', usersApi.admin.users, { name: 'Plain', email: 'plain@example.com', sendWelcomeEmail: false })
      expect(await coordinator.json<Row>('PATCH', usersApi.admin.user(plain.id), { name: 'Plain Renamed' })).toMatchObject({ name: 'Plain Renamed' })
      const detail = await coordinator.json<{ can: Record<string, boolean> }>('GET', usersApi.admin.user(plain.id))
      // `users:*` never covers the sensitive `users:pii`: no phone number, and changing it is refused.
      expect(detail.can).toEqual({ update: true, delete: true, manage: true, pii: false })
      expect(detail).not.toHaveProperty('phone')
      await expectApiError(coordinator.json('PATCH', usersApi.admin.user(plain.id), { phone: '+1 555 0100' }), 403)
      // Resending the stored value (here: no number) is refused too, so the status never confirms a guess.
      await expectApiError(coordinator.json('PATCH', usersApi.admin.user(plain.id), { phone: null }), 403)
      await expectApiError(coordinator.json('PATCH', usersApi.admin.user(plain.id), { phone: '' }), 403)
      expect(await coordinator.json<Row>('PATCH', usersApi.admin.user(plain.id), { name: 'Plain' })).not.toHaveProperty('phone')
      expect((await coordinator.fetch('DELETE', usersApi.admin.user(plain.id))).status).toBe(204)
    })

    it('refuses a coordinator every write on an admin (403 forbidden), but lets them read', async () => {
      const detail = await coordinator.json<{ can: Record<string, boolean> }>('GET', usersApi.admin.user(staffId))
      expect(detail.can).toEqual({ update: false, delete: false, manage: false, pii: false })

      await expectApiError(coordinator.json('PATCH', usersApi.admin.user(staffId), { name: 'Hijacked' }), 403, 'forbidden')
      await expectApiError(coordinator.json('PATCH', usersApi.admin.user(staffId), { email: 'mine@example.com' }), 403, 'forbidden')
      await expectApiError(coordinator.json('DELETE', usersApi.admin.user(staffId)), 403, 'forbidden')
      await expectApiError(coordinator.json('POST', usersApi.admin.resend(staffId)), 403, 'forbidden')
      expect(await staff.json<Row>('GET', usersApi.admin.user(staffId))).toMatchObject({ name: 'Staff', email: 'staff@example.com' })
    })

    it('fails closed when the target\'s roles cannot be resolved (403 forbidden, nothing changed)', async () => {
      const broken = await staff.json<Row>('POST', usersApi.admin.users, { name: 'Broken', email: 'broken-roles@example.com', sendWelcomeEmail: false })
      const detail = await coordinator.json<{ can: Record<string, boolean> }>('GET', usersApi.admin.user(broken.id))
      expect(detail.can).toEqual({ update: false, delete: false, manage: false, pii: false })
      await expectApiError(coordinator.json('PATCH', usersApi.admin.user(broken.id), { name: 'Renamed' }), 403, 'forbidden')
      await expectApiError(coordinator.json('DELETE', usersApi.admin.user(broken.id)), 403, 'forbidden')
      await expectApiError(staff.json('PATCH', usersApi.admin.user(broken.id), { name: 'Renamed' }), 403, 'forbidden')
      expect(await staff.json<Row>('GET', usersApi.admin.user(broken.id))).toMatchObject({ name: 'Broken' })
    })

    it('lets an admin change a coordinator', async () => {
      const { items } = await staff.json<Page>('GET', `${usersApi.admin.users}?q=coordinator`)
      const id = items[0]!.id
      expect(await staff.json<Row>('PATCH', usersApi.admin.user(id), { name: 'Coord' })).toMatchObject({ name: 'Coord' })
      expect((await staff.json<{ can: Record<string, boolean> }>('GET', usersApi.admin.user(id))).can).toEqual({ update: true, delete: true, manage: true, pii: true })
      // The phone number: set, shown, validated and cleared (an empty string clears it too).
      expect(await staff.json('PATCH', usersApi.admin.user(id), { phone: ' +45 12 34 56 78 ' })).toMatchObject({ phone: '+45 12 34 56 78' })
      expect(await staff.json('GET', usersApi.admin.user(id))).toMatchObject({ phone: '+45 12 34 56 78' })
      await expectApiError(staff.json('PATCH', usersApi.admin.user(id), { phone: 'call me' }), 400)
      expect(await staff.json('PATCH', usersApi.admin.user(id), { phone: '' })).toMatchObject({ phone: null })
    })
  })

  describe('creating users (POST /api/admin/users)', () => {
    let coordinator: ReturnType<typeof apiClient>
    const loginAs = async (email: string) => {
      const login = await apiClient().fetch('POST', authApi.login, { email, password: 'supersecret123' })
      expect(login.status, await login.clone().text()).toBe(200)
      return apiClient({ cookie: login.headers.get('set-cookie')!.split(';')[0]! })
    }

    it('refuses a user without users:create (403), before the body is looked at', async () => {
      await expectApiError(member.json('POST', usersApi.admin.users, { name: 'X', email: 'x-create@example.com', phone: '+45 11 11 11 11' }), 403, 'forbidden')
      await expectApiError(member.json('POST', usersApi.admin.users, { phone: 'not a phone' }), 403, 'forbidden')
    })

    it('answers 409 with the holder\'s id for a taken email, whatever its case', async () => {
      const { items } = await staff.json<Page>('GET', `${usersApi.admin.users}?q=staff%40example.com`)
      const response = await staff.fetch('POST', usersApi.admin.users, { name: 'Again', email: 'STAFF@example.com' })
      expect(response.status).toBe(409)
      expect((await response.json() as { data: unknown }).data).toMatchObject({ code: 'conflict', field: 'email', userId: items[0]!.id })
    })

    it('stores the phone number and language, and emails the invite only when asked', async () => {
      const before = (await sentMails()).length
      const invited = await staff.json<Row>('POST', usersApi.admin.users, { name: 'Invited', email: 'invited@example.com', phone: ' +45 22 33 44 55 ', locale: 'da' })
      expect(invited).toMatchObject({ email: 'invited@example.com', phone: '+45 22 33 44 55' })
      const mails = await sentMails()
      expect(mails.length).toBe(before + 1)
      expect(mails.at(-1)!.to).toBe('invited@example.com')
      const refsOf = async (id: number) => (await $fetch<{ refs: Array<{ id: number, locale: string | null }> }>('/api/test/user-refs', { method: 'POST', body: { ids: [id] } })).refs[0]
      expect(await refsOf(invited.id)).toMatchObject({ id: invited.id, locale: 'da' })

      const quiet = await staff.json<Row>('POST', usersApi.admin.users, { name: 'Quiet', email: 'quiet@example.com', sendWelcomeEmail: false })
      expect((await sentMails()).length).toBe(before + 1)
      // Without a language from the staff member's UI it stays unset.
      expect((await refsOf(quiet.id))!.locale).toBeNull()

      await expectApiError(staff.json('POST', usersApi.admin.users, { name: 'Bad', email: 'bad-phone@example.com', phone: 'call me' }), 400)
    })

    it('never tells a caller without users:pii that a phone number is taken', async () => {
      coordinator = await loginAs('coordinator@example.com')
      // `invited@example.com` holds +45 22 33 44 55: the same number is stored again, and the answer has no phone.
      const first = await coordinator.fetch('POST', usersApi.admin.users, { name: 'Same Phone', email: 'same-phone@example.com', phone: '+45 22 33 44 55', sendWelcomeEmail: false })
      const second = await coordinator.fetch('POST', usersApi.admin.users, { name: 'New Phone', email: 'new-phone@example.com', phone: '+45 99 88 77 66', sendWelcomeEmail: false })
      expect([first.status, second.status]).toEqual([201, 201])
      const [taken, fresh] = await Promise.all([first.json(), second.json()]) as Row[]
      expect(taken).not.toHaveProperty('phone')
      expect(Object.keys(taken!).sort()).toEqual(Object.keys(fresh!).sort())
      // Staff with `users:pii` see what was stored.
      expect(await staff.json('GET', usersApi.admin.user(taken!.id))).toMatchObject({ phone: '+45 22 33 44 55' })
    })
  })

  describe('API tokens with users:read', () => {
    const createToken = (client: ReturnType<typeof apiClient>, scopes: string[]) =>
      client.fetch('POST', authApi.me.tokens, { name: 'sync', scopes })
    const tokenClient = async (client: ReturnType<typeof apiClient>, scopes: string[]) => {
      const response = await createToken(client, scopes)
      expect(response.status, await response.clone().text()).toBe(201)
      return apiClient({ bearer: (await response.json() as { token: string }).token })
    }

    it('is staff only: a user without the permission cannot obtain it', async () => {
      const response = await createToken(member, ['users:read'])
      expect(response.status).toBe(403)
      expect((await response.json() as { data: { code: string } }).data.code).toBe('insufficient_permission')
      const scopes = await member.json<{ name: string }[]>('GET', authApi.scopes)
      expect(scopes.map(scope => scope.name)).not.toContain('users:read')
    })

    it('lets a staff token read the directory and a user, never change them', async () => {
      const token = await tokenClient(staff, ['users:read', 'users:list'])
      const { items } = await token.json<Page>('GET', usersApi.admin.users)
      expect(items.map(u => u.id)).toContain(memberId)
      const user = await token.json<Row & { can: { update: boolean, delete: boolean } }>('GET', usersApi.admin.user(memberId))
      expect(user).toMatchObject({ id: memberId, can: { update: false, delete: false, manage: false } })

      // Writes need their own permissions, which this token lacks; deleting and `users:manage` are session only.
      await expectApiError(token.json('PATCH', usersApi.admin.user(memberId), { name: 'X' }), 403, 'insufficient_scope')
      await expectApiError(token.json('POST', usersApi.admin.users, { name: 'X', email: 'x@example.com' }), 403, 'insufficient_scope')
      await expectApiError(token.json('DELETE', usersApi.admin.user(memberId)), 403, 'session_required')
      await expectApiError(token.json('POST', usersApi.admin.resend(memberId)), 403, 'session_required')
      // A token that may only read one user cannot list them.
      await expectApiError((await tokenClient(staff, ['users:read'])).json('GET', usersApi.admin.users), 403, 'insufficient_scope')
    })

    it('lets a token with users:update rename, but not touch the email (users:manage is session only)', async () => {
      const token = await tokenClient(staff, ['users:update'])
      expect(await token.json<Row>('PATCH', usersApi.admin.user(memberId), { name: 'Member Renamed' })).toMatchObject({ name: 'Member Renamed' })
      await expectApiError(token.json('PATCH', usersApi.admin.user(memberId), { email: 'elsewhere@example.com' }), 403, 'session_required')
    })

    it('lets a token with users:create create a user and send the invite; one without it gets insufficient_scope', async () => {
      const token = await tokenClient(staff, ['users:create'])
      const before = (await sentMails()).length
      const created = await token.fetch('POST', usersApi.admin.users, { name: 'By Token', email: 'by-token@example.com' })
      expect(created.status, await created.clone().text()).toBe(201)
      expect((await sentMails()).length).toBe(before + 1)
      await expectApiError((await tokenClient(staff, ['users:list'])).json('POST', usersApi.admin.users, { name: 'No', email: 'no-token@example.com' }), 403, 'insufficient_scope')
    })

    it('refuses a token without the scope (403 insufficient_scope)', async () => {
      const token = await tokenClient(staff, ['test:read'])
      await expectApiError(token.json('GET', usersApi.admin.users), 403, 'insufficient_scope')
      await expectApiError(token.json('GET', usersApi.admin.user(memberId)), 403, 'insufficient_scope')
    })

    it('never gives a token more than its user holds', async () => {
      // A member cannot mint `*` (they do not hold everything), and a token of theirs never reaches the staff routes.
      const wildcard = await createToken(member, ['*'])
      expect(wildcard.status).toBe(403)
      expect((await wildcard.json() as { data: { code: string } }).data.code).toBe('insufficient_permission')
      const token = await tokenClient(member, ['profile:read'])
      await expectApiError(token.json('GET', usersApi.admin.users), 403, 'insufficient_scope')
    })
  })

  // `@frigear-nu/admin`'s Settings > Search button: this fixture has the admin module, auth and a search index (users).
  describe('rebuilding search (POST /api/admin/search/reindex)', () => {
    it('runs search:reindex for an admin session and answers the rows read and rewritten per table', async () => {
      const { tables } = await staff.json<AdminSearchReindexDto>('POST', adminApi.search.reindex)
      expect(tables.find(table => table.table === 'users')).toEqual({ table: 'users', scanned: expect.any(Number), updated: expect.any(Number) })
      expect(tables.find(table => table.table === 'users')!.scanned).toBeGreaterThan(0)
      // Idempotent: a second run rewrites nothing.
      const again = await staff.json<AdminSearchReindexDto>('POST', adminApi.search.reindex)
      expect(again.tables.every(table => table.updated === 0)).toBe(true)
    })

    it('refuses guests, users without the permission and every API token (session only)', async () => {
      await expectApiError(anonymous.json('POST', adminApi.search.reindex), 401)
      await expectApiError(member.json('POST', adminApi.search.reindex), 403, 'forbidden')
      // `search:reindex` is session only: a token cannot be given it by name (400), and a staff `*` token, which covers
      // everything its admin holds, is still turned away.
      const named = await staff.fetch('POST', authApi.me.tokens, { name: 'reindex', scopes: ['search:reindex'] })
      expect(named.status).toBe(400)
      const minted = await staff.fetch('POST', authApi.me.tokens, { name: 'everything', scopes: ['*'] })
      expect(minted.status, await minted.clone().text()).toBe(201)
      const holder = apiClient({ bearer: (await minted.json() as { token: string }).token })
      await expectApiError(holder.json('POST', adminApi.search.reindex), 403, 'session_required')
      // A token without it.
      const other = await staff.fetch('POST', authApi.me.tokens, { name: 'read', scopes: ['users:read'] })
      const reader = apiClient({ bearer: (await other.json() as { token: string }).token })
      await expectApiError(reader.json('POST', adminApi.search.reindex), 403)
    })
  })
})

describe('users self-service routes (authenticated)', () => {
  it('updates the profile for the logged-in user and answers the profile DTO', async () => {
    const cookie = await registerAndGetCookie({ name: 'Ada Lovelace', email: 'lovelace@example.com', password: 'supersecret123' })
    const ada = apiClient({ cookie })

    const result = await ada.json<Record<string, unknown>>('PATCH', usersApi.me.profile, { name: 'Ada Updated', avatar: 'https://example.com/ada.png' })
    expect(result).toMatchObject({ name: 'Ada Updated', email: 'lovelace@example.com', avatar: 'https://example.com/ada.png' })
    expect(Object.keys(result).sort()).toEqual(['avatar', 'email', 'emailVerifiedAt', 'id', 'locale', 'name', 'phone'])

    // The caller's own phone number: set, kept when left out, cleared with `null`.
    expect(await ada.json('PATCH', usersApi.me.profile, { phone: '+1 (555) 010-0101' })).toMatchObject({ phone: '+1 (555) 010-0101' })
    expect(await ada.json('PATCH', usersApi.me.profile, { name: 'Ada Updated' })).toMatchObject({ phone: '+1 (555) 010-0101' })
    await expectApiError(ada.json('PATCH', usersApi.me.profile, { phone: 'x'.repeat(41) }), 400)
    expect(await ada.json('PATCH', usersApi.me.profile, { phone: null })).toMatchObject({ phone: null })

    // `null` clears the avatar, leaving it out keeps it.
    expect(await ada.json('PATCH', usersApi.me.profile, { name: 'Ada' })).toMatchObject({ avatar: 'https://example.com/ada.png' })
    expect(await ada.json('PATCH', usersApi.me.profile, { avatar: null })).toMatchObject({ name: 'Ada', avatar: null })

    // The language: without i18n (this fixture) any short BCP-47 tag; kept when left out, cleared with `null` or `''`.
    expect(result).toMatchObject({ locale: null })
    expect(await ada.json('PATCH', usersApi.me.profile, { locale: ' en-GB ' })).toMatchObject({ locale: 'en-GB' })
    expect(await ada.json('PATCH', usersApi.me.profile, { name: 'Ada' })).toMatchObject({ locale: 'en-GB' })
    await expectApiError(ada.json('PATCH', usersApi.me.profile, { locale: 'english please' }), 400)
    await expectApiError(ada.json('PATCH', usersApi.me.profile, { locale: 'x'.repeat(21) }), 400)
    expect(await ada.json('PATCH', usersApi.me.profile, { locale: '' })).toMatchObject({ locale: null })

    await expectApiError(apiClient().json('PATCH', usersApi.me.profile, { name: 'Nobody' }), 401)
  })

  it('validates the profile request body', async () => {
    const cookie = await registerAndGetCookie({ name: 'Grace Hopper', email: 'grace@example.com', password: 'supersecret123' })
    const grace = apiClient({ cookie })

    await expectApiError(grace.json('PATCH', usersApi.me.profile, { name: '' }), 400)
    await expectApiError(grace.json('PATCH', usersApi.me.profile, { name: 'x'.repeat(121) }), 400)
    await expectApiError(grace.json('PATCH', usersApi.me.profile, { avatar: 'javascript:alert(1)' }), 400)
    await expectApiError(grace.json('PATCH', usersApi.me.profile, { avatar: 'ftp://example.com/a.png' }), 400)
    await expectApiError(grace.json('PATCH', usersApi.me.profile, { avatar: 'not a url' }), 400)
  })

  it('changes the email address for the logged-in user, lowercased', async () => {
    const cookie = await registerAndGetCookie({ name: 'Margaret Hamilton', email: 'margaret@example.com', password: 'supersecret123' })

    const result = await apiClient({ cookie }).json('PUT', usersApi.me.email, { email: ' Margaret-New@Example.com ' })
    expect(result).toMatchObject({ email: 'margaret-new@example.com', verificationRequired: false })

    const login = await apiClient().fetch('POST', authApi.login, { email: 'margaret-new@example.com', password: 'supersecret123' })
    expect(login.status, await login.clone().text()).toBe(200)
  })

  it('rejects changing the email address to one already in use, whatever its case', async () => {
    await registerAndGetCookie({ name: 'Katherine Johnson', email: 'katherine@example.com', password: 'supersecret123' })
    const cookie = await registerAndGetCookie({ name: 'Dorothy Vaughan', email: 'dorothy@example.com', password: 'supersecret123' })
    const dorothy = apiClient({ cookie })

    await expectApiError(dorothy.json('PUT', usersApi.me.email, { email: 'katherine@example.com' }), 409, 'conflict')
    await expectApiError(dorothy.json('PUT', usersApi.me.email, { email: 'Katherine@EXAMPLE.com' }), 409, 'conflict')
    // Your own address (in another case) is not a conflict.
    expect(await dorothy.json('PUT', usersApi.me.email, { email: 'Dorothy@Example.com' })).toMatchObject({ email: 'dorothy@example.com' })
  })

  it('changes the password for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Annie Easley', email: 'annie@example.com', password: 'supersecret123' })

    const result = await apiClient({ cookie }).json('PUT', usersApi.me.password, {
      currentPassword: 'supersecret123',
      newPassword: 'new-password123',
      confirmNewPassword: 'new-password123',
    })
    expect(result).toMatchObject({ email: 'annie@example.com' })
    expect(result).not.toHaveProperty('password')

    await expect(apiClient().json('POST', authApi.login, { email: 'Annie@Example.com', password: 'new-password123' }))
      .resolves.toHaveProperty('id')
  })

  it('rejects an incorrect current password', async () => {
    const cookie = await registerAndGetCookie({ name: 'Mary Jackson', email: 'mary@example.com', password: 'supersecret123' })

    await expectApiError(apiClient({ cookie }).json('PUT', usersApi.me.password, {
      currentPassword: 'wrong-password',
      newPassword: 'new-password123',
      confirmNewPassword: 'new-password123',
    }), 401)
  })

  it('rejects mismatched new passwords', async () => {
    const cookie = await registerAndGetCookie({ name: 'Mae Jemison', email: 'mae@example.com', password: 'supersecret123' })

    await expectApiError(apiClient({ cookie }).json('PUT', usersApi.me.password, {
      currentPassword: 'supersecret123',
      newPassword: 'new-password123',
      confirmNewPassword: 'different-password123',
    }), 400)
  })

  describe('MCP tools', () => {
    it('shows the profile tool to signed-in users only and returns just their own allow-listed fields', async () => {
      expect((await mcpRpc(undefined, 'tools/list')).result?.tools ?? []).toEqual([])

      const ada = await mcpRegister('Ada', 'mcp-ada@example.com')
      await mcpRegister('Bo', 'mcp-bo@example.com')
      const tools = (await mcpRpc(ada, 'tools/list')).result?.tools.map((tool: { name: string }) => tool.name)
      expect(tools).toContain('get-my-profile')

      const profile = await mcpRpc(ada, 'tools/call', { name: 'get-my-profile', arguments: {} })
      const body = JSON.stringify(profile)
      expect(body).toContain('mcp-ada@example.com')
      expect(body).not.toContain('mcp-bo@example.com')
      expect(body).not.toMatch(/password|hash/i)
    })
  })
})

describe('ssr', () => {
  it('renders the index page', async () => {
    // Get response to a server-rendered page with `$fetch`.
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })

  it('registers the self-service routes and requires an authenticated session', async () => {
    const anonymous = apiClient()
    await expectApiError(anonymous.json('PATCH', usersApi.me.profile, { name: 'Ada' }), 401)
    await expectApiError(anonymous.json('PUT', usersApi.me.email, { email: 'ada@example.com' }), 401)
    await expectApiError(anonymous.json('PUT', usersApi.me.password, {
      currentPassword: 'current',
      newPassword: 'new-password123',
      confirmNewPassword: 'new-password123',
    }), 401)
  })
})

describe('the user\'s language (users.locale)', () => {
  it('fills an empty language at sign-in or a switch, and never replaces one the user has', async () => {
    const cookie = await registerAndGetCookie({ name: 'Lang Lovelace', email: 'lang@example.com', password: 'supersecret123' })
    const me = apiClient({ cookie })

    // Empty: `ifUnset` fills it, and the session user carries it.
    const response = await me.fetch('PUT', usersApi.me.locale, { locale: 'da', ifUnset: true })
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await response.json()).toMatchObject({ locale: 'da' })
    const session = await $fetch<{ user: { locale?: string } }>('/api/_auth/session', { headers: { cookie: response.headers.get('set-cookie')! } })
    expect(session.user.locale).toBe('da')

    // Set: another `ifUnset` (a later sign-in, a language switch) leaves it alone; an explicit PUT replaces it.
    expect(await me.json('PUT', usersApi.me.locale, { locale: 'en', ifUnset: true })).toMatchObject({ locale: 'da' })
    expect(await me.json('PUT', usersApi.me.locale, { locale: 'en' })).toMatchObject({ locale: 'en' })
    await expectApiError(me.json('PUT', usersApi.me.locale, { locale: 'not a language' }), 400)
    await expectApiError(me.json('PUT', usersApi.me.locale, { locale: null }), 400)
    await expectApiError(apiClient().json('PUT', usersApi.me.locale, { locale: 'da' }), 401)

    // notify's recipient store hands it to `notifyUser`.
    expect(await $fetch('/api/test/recipient', { method: 'POST', body: { email: 'lang@example.com' } })).toEqual({ email: 'lang@example.com', phone: null, locale: 'en' })
  })
})

describe('user lookups for other modules (loadUserRefs, searchUserRefs)', () => {
  type Ref = { id: number, name: string | null, email: string | null, avatar: string | null, phone: string | null, locale: string | null }
  const lookup = (body: Record<string, unknown>) => $fetch<{ refs: Ref[], found: Ref[] }>('/api/test/user-refs', { method: 'POST', body })

  it('loads users by id in chunks, skipping ids that are not whole numbers or unknown', async () => {
    const cookie = await registerAndGetCookie({ name: 'Lookup Lovelace', email: 'lookup@example.com', password: 'supersecret123' })
    await apiClient({ cookie }).json('PATCH', usersApi.me.profile, { phone: '+1 555 0100' })
    const { found: [me] } = await lookup({ q: 'Lookup Lovelace', pii: true })
    expect(me).toEqual({ id: expect.any(Number), name: 'Lookup Lovelace', email: 'lookup@example.com', avatar: null, phone: '+1 555 0100', locale: null })

    // More ids than one D1 statement binds, as numbers and numeric strings, with junk among them.
    const ids = [...Array.from({ length: 250 }, (_, index) => 100_000 + index), String(me!.id), me!.id, 'abc', null, '1.5']
    const { refs } = await lookup({ ids })
    expect(refs).toEqual([me])
  })

  it('finds many users at once for auth\'s role holders (findByIds), in chunks', async () => {
    const { found: [me] } = await lookup({ q: 'Lookup Lovelace', pii: true })
    const ids = [...Array.from({ length: 250 }, (_, index) => 100_000 + index), me!.id, String(me!.id), 'abc']
    expect(await $fetch('/api/test/find-by-ids', { method: 'POST', body: { ids } })).toEqual([me!.id])
    expect(await $fetch('/api/test/find-by-ids', { method: 'POST', body: { ids: [] } })).toEqual([])
  })

  it('searches names, and emails only with pii, which also gates the email and phone in the answer', async () => {
    expect((await lookup({ q: 'lookup@' })).found).toEqual([])
    expect((await lookup({ q: 'lookup love' })).found).toEqual([expect.objectContaining({ name: 'Lookup Lovelace', email: null, phone: null })])
    expect((await lookup({ q: 'LOOKUP@example', pii: true })).found).toEqual([expect.objectContaining({ email: 'lookup@example.com', phone: '+1 555 0100' })])
    expect((await lookup({ q: '   ' })).found).toEqual([])
    expect((await lookup({ q: 'a', limit: 1 })).found).toHaveLength(1)
  })

  it('folds capital Ø, Æ and Å in names on sqlite (users.searchText), also after a rename', async () => {
    const cookie = await registerAndGetCookie({ name: 'ØRSTED ÆBLE', email: 'orsted@example.com', password: 'supersecret123' })
    for (const q of ['ørsted', 'ØRSTED', 'Ørsted æble', 'æble']) {
      expect((await lookup({ q })).found.map(ref => ref.name)).toEqual(['ØRSTED ÆBLE'])
    }
    // The admin list searches the same column.
    const login = await apiClient().fetch('POST', authApi.login, { email: 'staff@example.com', password: 'supersecret123' })
    expect(login.status, await login.clone().text()).toBe(200)
    const admin = apiClient({ cookie: login.headers.get('set-cookie')!.split(';')[0]! })
    const page = await admin.json<{ items: Array<{ name: string }> }>('GET', `${usersApi.admin.users}?q=${encodeURIComponent('ørsted')}`)
    expect(page.items.map(item => item.name)).toEqual(['ØRSTED ÆBLE'])

    await apiClient({ cookie }).json('PATCH', usersApi.me.profile, { name: 'Åse Ørsted' })
    expect((await lookup({ q: 'åSE' })).found.map(ref => ref.name)).toEqual(['Åse Ørsted'])
    expect((await lookup({ q: 'æble' })).found).toEqual([])
  })

  it('search:reindex refolds users.searchText left by an ASCII-only lower() backfill, and a second run changes nothing', async () => {
    await registerAndGetCookie({ name: 'ÆRØ ÅSEN', email: 'aero@example.com', password: 'supersecret123' })
    const sqlite = fixtureSqlite(`${dataDir}/db/sqlite.db`)
    // What the migration's backfill stores: sqlite's lower() keeps Æ, Ø and Å.
    sqlite.exec('update users set searchText = lower(name)')
    const stale = () => sqlite.query<{ searchText: string }>('select searchText from users where email = ?', 'aero@example.com')[0]!.searchText
    expect(stale()).toBe('ÆrØ Åsen')
    expect((await lookup({ q: 'ærø' })).found).toEqual([])

    const first = reindexOf(await runSearchReindex(), 'users')!
    expect(first.updated).toBeGreaterThanOrEqual(1)
    expect(stale()).toBe('ærø åsen')
    expect((await lookup({ q: 'ærø' })).found.map(ref => ref.name)).toEqual(['ÆRØ ÅSEN'])

    expect(reindexOf(await runSearchReindex(), 'users')).toEqual({ ...first, updated: 0 })
  })
})
