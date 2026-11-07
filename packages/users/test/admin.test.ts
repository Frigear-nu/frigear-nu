import { fileURLToPath } from 'node:url'
import { readFile, rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
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

  it('is closed to guests and to users the host policy does not allow', async () => {
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
    expect(Object.keys(user).sort()).toEqual(['avatar', 'createdAt', 'email', 'emailVerifiedAt', 'id', 'lastLoginAt', 'name'])

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
    await expectApiError(member.json('GET', usersApi.admin.roles), 401)
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

  it('offers the roles the host policy allows to the acting user', async () => {
    await expectApiError(anonymous.json('GET', usersApi.admin.roles), 401)
    await expectApiError(member.json('GET', usersApi.admin.roles), 403)
    expect(await staff.json('GET', usersApi.admin.roles)).toEqual({ roles: ['manager', 'user'] })
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
    // Deleting yourself is never offered.
    expect(detail.can).toEqual({ update: true, delete: false })

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

  it('deletes users (204) through the policy but never the acting user', async () => {
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

  describe('API tokens with users:read', () => {
    const createToken = (client: ReturnType<typeof apiClient>, scopes: string[]) =>
      client.fetch('POST', authApi.me.tokens, { name: 'sync', scopes })
    const tokenClient = async (client: ReturnType<typeof apiClient>, scopes: string[]) => {
      const response = await createToken(client, scopes)
      expect(response.status, await response.clone().text()).toBe(201)
      return apiClient({ bearer: (await response.json() as { token: string }).token })
    }

    it('is staff only: a user the policy does not allow cannot obtain it', async () => {
      const response = await createToken(member, ['users:read'])
      expect(response.status).toBe(400)
      expect((await response.json() as { data: { code: string } }).data.code).toBe('unknown_scope')
      const scopes = await member.json<{ name: string }[]>('GET', authApi.scopes)
      expect(scopes.map(scope => scope.name)).not.toContain('users:read')
    })

    it('lets a staff token read the directory and a user, never change them', async () => {
      const token = await tokenClient(staff, ['users:read'])
      const { items } = await token.json<Page>('GET', usersApi.admin.users)
      expect(items.map(u => u.id)).toContain(memberId)
      const user = await token.json<Row & { can: { update: boolean, delete: boolean } }>('GET', usersApi.admin.user(memberId))
      expect(user).toMatchObject({ id: memberId, can: { update: false, delete: false } })

      await expectApiError(token.json('PATCH', usersApi.admin.user(memberId), { name: 'X' }), 403, 'session_required')
      await expectApiError(token.json('POST', usersApi.admin.users, { name: 'X', email: 'x@example.com' }), 403, 'session_required')
      await expectApiError(token.json('DELETE', usersApi.admin.user(memberId)), 403, 'session_required')
    })

    it('refuses a token without the scope (403 insufficient_scope)', async () => {
      const token = await tokenClient(staff, ['test:read'])
      await expectApiError(token.json('GET', usersApi.admin.users), 403, 'insufficient_scope')
      await expectApiError(token.json('GET', usersApi.admin.user(memberId)), 403, 'insufficient_scope')
    })

    it('still runs the policy against the token user', async () => {
      // A `*` token is grantable to anyone, but the policy denies a member every staff read.
      const token = await tokenClient(member, ['*'])
      await expectApiError(token.json('GET', usersApi.admin.users), 403, 'forbidden')
    })
  })
})

describe('users self-service routes (authenticated)', () => {
  it('updates the profile for the logged-in user and answers the profile DTO', async () => {
    const cookie = await registerAndGetCookie({ name: 'Ada Lovelace', email: 'lovelace@example.com', password: 'supersecret123' })
    const ada = apiClient({ cookie })

    const result = await ada.json<Record<string, unknown>>('PATCH', usersApi.me.profile, { name: 'Ada Updated', avatar: 'https://example.com/ada.png' })
    expect(result).toMatchObject({ name: 'Ada Updated', email: 'lovelace@example.com', avatar: 'https://example.com/ada.png' })
    expect(Object.keys(result).sort()).toEqual(['avatar', 'email', 'emailVerifiedAt', 'id', 'name'])

    // `null` clears the avatar, leaving it out keeps it.
    expect(await ada.json('PATCH', usersApi.me.profile, { name: 'Ada' })).toMatchObject({ avatar: 'https://example.com/ada.png' })
    expect(await ada.json('PATCH', usersApi.me.profile, { avatar: null })).toMatchObject({ name: 'Ada', avatar: null })

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
