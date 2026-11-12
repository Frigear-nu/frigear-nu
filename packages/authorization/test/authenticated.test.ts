import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { authApi } from '@frigear-nu/auth/api'
import { authorizationApi } from '../src/runtime/utils/api'
import type { AuthorizationPermissionMatrixDto, AuthorizationRoleDto, AuthorizationRoleSummaryDto, AuthorizationRoleUsersPageDto } from '../src/runtime/utils/api'

async function register(payload: { name: string, email: string, password: string }) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.text()
  expect(response.status, body).toBe(201)
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie after registering.')
  return { cookie, user: JSON.parse(body) as { id: number, role?: string } }
}

async function login(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  expect(response.status, await response.text()).toBe(200)
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie after logging in.')
  return cookie
}

describe('authorization (authenticated)', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/authenticated', import.meta.url)),
    // Dev mode lets NuxtHub apply the committed sqlite migrations on startup.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  const password = 'supersecret123'
  let userCookie: string
  let userId: number
  let adminCookie: string

  it('registers users with the default "user" role', async () => {
    const registered = await register({ name: 'Ada', email: 'ada@example.com', password })
    userCookie = registered.cookie
    userId = registered.user.id
    expect(await $fetch('/api/_auth/session', { headers: { cookie: userCookie } })).toMatchObject({ user: { role: 'user' } })

    await register({ name: 'Grace', email: 'grace@example.com', password })
    await $fetch('/api/test/make-admin', { method: 'POST', body: { email: 'grace@example.com' } })
    // The role is stored in the session at login time, so log in again to pick it up.
    adminCookie = await login('grace@example.com', password)
    expect(await $fetch('/api/_auth/session', { headers: { cookie: adminCookie } })).toMatchObject({ user: { role: 'admin' } })
  })

  describe('server helpers', () => {
    it('rejects guests with 403 from an ability (guests are denied by default)', async () => {
      await expect($fetch('/api/test/post', { method: 'POST', body: { userId: 1 } }))
        .rejects.toMatchObject({ statusCode: 403 })
    })

    it('injects the user into the policy and surfaces deny() details', async () => {
      await expect($fetch('/api/test/post', { method: 'POST', headers: { cookie: userCookie }, body: { userId: userId + 100 } }))
        .rejects.toMatchObject({ statusCode: 403, statusMessage: expect.anything() })
      await expect($fetch('/api/test/post', { method: 'POST', headers: { cookie: userCookie }, body: { userId } }))
        .resolves.toEqual({ ok: true, allowed: true })
    })

    it('lets an admin pass the ownership policy', async () => {
      await expect($fetch('/api/test/post', { method: 'POST', headers: { cookie: adminCookie }, body: { userId: userId + 100 } }))
        .resolves.toEqual({ ok: true, allowed: true })
    })
  })

  describe('route rules (api)', () => {
    it('returns 401 for guests and 403 for the wrong role', async () => {
      await expect($fetch('/api/admin/stats')).rejects.toMatchObject({ statusCode: 401 })
      await expect($fetch('/api/admin/stats', { headers: { cookie: userCookie } })).rejects.toMatchObject({ statusCode: 403 })
      await expect($fetch('/api/admin/stats', { headers: { cookie: adminCookie } })).resolves.toEqual({ secret: 42 })
    })

    it('an empty rule just requires a logged-in user', async () => {
      await expect($fetch('/api/members')).rejects.toMatchObject({ statusCode: 401 })
      await expect($fetch('/api/members', { headers: { cookie: userCookie } })).resolves.toEqual({ members: true })
    })
  })

  describe('route rules (pages)', () => {
    const page = (path: string, cookie?: string) => fetch(path, { headers: cookie ? { cookie } : {} })

    it('gates pages from config rules, including during SSR', async () => {
      expect((await page('/admin')).status).toBe(401)
      expect((await page('/admin', userCookie)).status).toBe(403)
      const ok = await page('/admin', adminCookie)
      expect(ok.status).toBe(200)
      expect(await ok.text()).toContain('admin-area')
    })

    it('lets a more specific `authenticated: false` rule open a sub-route', async () => {
      const response = await page('/admin/public')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('admin-public-page')
    })

    it('resolves abilities by name from the abilities file', async () => {
      expect((await page('/ability-rule', userCookie)).status).toBe(403)
      expect((await page('/ability-rule', adminCookie)).status).toBe(200)
    })

    it('lets definePageMeta({ authorize }) replace config rules', async () => {
      expect((await page('/meta-override')).status).toBe(200)
      expect((await page('/admin-meta', userCookie)).status).toBe(403)
      expect((await page('/admin-meta', adminCookie)).status).toBe(200)
    })
  })

  describe('<Can>', () => {
    it('renders the slot or the fallback based on the resolved user', async () => {
      const guest = await $fetch<string>('/')
      expect(guest).toContain('cannot-edit')

      const owner = await $fetch<string>('/', { headers: { cookie: userCookie } })
      // post.userId is 1, the first registered user.
      expect(owner).toContain(userId === 1 ? 'can-edit' : 'cannot-edit')

      const admin = await $fetch<string>('/', { headers: { cookie: adminCookie } })
      expect(admin).toContain('can-edit')
    })
  })

  async function createToken(cookie: string, scopes: string[] = ['*']) {
    const response = await fetch(authApi.me.tokens, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'test', scopes }),
    })
    expect(response.status, await response.clone().text()).toBe(201)
    return (await response.json() as { token: string }).token
  }

  describe('bearer tokens (via @frigear-nu/auth)', () => {
    it('applies route rules to API tokens, as the owner (a role rule is session-only by default)', async () => {
      const userToken = await createToken(userCookie)
      const adminToken = await createToken(adminCookie)

      await expect($fetch('/api/members', { headers: { authorization: `Bearer ${userToken}` } })).resolves.toEqual({ members: true })
      await expect($fetch('/api/admin/stats', { headers: { authorization: `Bearer ${userToken}` } })).rejects.toMatchObject({ statusCode: 403 })
      // Even a full-access token of an admin does not pass a plain role rule: the rule is session-only.
      await expect($fetch('/api/admin/stats', { headers: { authorization: `Bearer ${adminToken}` } })).rejects.toMatchObject({ statusCode: 403 })
      await expect($fetch('/api/admin/stats', { headers: { cookie: adminCookie } })).resolves.toEqual({ secret: 42 })
    })

    it('lets a rule opt bearer credentials in, with the scopes it lists', async () => {
      const full = await createToken(adminCookie)
      const reports = await createToken(adminCookie, ['reports:read'])
      const other = await createToken(adminCookie, ['reports:write'])
      const userReports = await createToken(userCookie, ['reports:read'])
      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } })

      await expect($fetch('/api/reports', bearer(reports))).resolves.toEqual({ reports: true })
      await expect($fetch('/api/reports', bearer(full))).resolves.toEqual({ reports: true })
      await expect($fetch('/api/reports', bearer(other))).rejects.toMatchObject({ statusCode: 403 })
      // The role still applies.
      await expect($fetch('/api/reports', bearer(userReports))).rejects.toMatchObject({ statusCode: 403 })
      await expect($fetch('/api/reports', { headers: { cookie: adminCookie } })).resolves.toEqual({ reports: true })

      // `sessionOnly: false` accepts any scopes.
      await expect($fetch('/api/open-admin', bearer(other))).resolves.toEqual({ open: true })
      await expect($fetch('/api/open-admin', bearer(userReports))).rejects.toMatchObject({ statusCode: 403 })
    })

    it('treats an invalid token as unauthenticated, even next to a valid session', async () => {
      await expect($fetch('/api/members', { headers: { authorization: 'Bearer fnu_invalid' } })).rejects.toMatchObject({ statusCode: 401 })
      await expect($fetch('/api/members', { headers: { authorization: 'Bearer fnu_invalid', cookie: userCookie } })).rejects.toMatchObject({ statusCode: 401 })
    })

    it('reads the role fresh, for tokens and sessions alike', async () => {
      const linus = await register({ name: 'Linus', email: 'linus@example.com', password })
      const token = await createToken(linus.cookie)
      await expect($fetch('/api/open-admin', { headers: { authorization: `Bearer ${token}` } })).rejects.toMatchObject({ statusCode: 403 })

      await $fetch('/api/test/make-admin', { method: 'POST', body: { email: 'linus@example.com' } })

      await expect($fetch('/api/open-admin', { headers: { authorization: `Bearer ${token}` } })).resolves.toEqual({ open: true })
      // The session reads the user again too: the role rule sees the promotion without a new sign-in.
      await expect($fetch('/api/admin/stats', { headers: { cookie: linus.cookie } })).resolves.toEqual({ secret: 42 })
    })

    it('keeps token management session-only', async () => {
      const token = await createToken(userCookie)
      await expect($fetch(authApi.me.tokens, { headers: { authorization: `Bearer ${token}` } })).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  describe('role-based access control (rbac: true, no host policy listener)', () => {
    const setRole = (email: string, role: string) => $fetch('/api/test/set-role', { method: 'POST', body: { email, role } })
    const scopeNames = async (cookie: string) => (await $fetch<{ name: string }[]>(authApi.scopes, { headers: { cookie } })).map(scope => scope.name)

    it('reports the role and its permissions', async () => {
      const mine = await $fetch<{ role: { name: string }, permissions: string[] }>('/api/authorization/me/permissions', { headers: { cookie: userCookie } })
      expect(mine.role.name).toBe('user')
      expect(mine.permissions).toEqual(['reports:read'])
      const admin = await $fetch<{ permissions: string[] }>('/api/authorization/me/permissions', { headers: { cookie: adminCookie } })
      expect(admin.permissions).toContain('*')
    })

    it('lets the role decide a staff guard, and reads it fresh', async () => {
      const ada = await register({ name: 'Edith', email: 'edith@example.com', password })
      await expect($fetch('/api/test/staff', { headers: { cookie: ada.cookie } })).rejects.toMatchObject({ statusCode: 403 })
      await setRole('edith@example.com', 'editor')
      await expect($fetch('/api/test/staff', { headers: { cookie: ada.cookie } })).resolves.toEqual({ staff: true })
      await expect($fetch('/api/test/staff', { headers: { cookie: adminCookie } })).resolves.toEqual({ staff: true })
    })

    it('only shows and grants the scopes the user holds', async () => {
      expect(await scopeNames(userCookie)).toEqual(['*', 'reports:read'])
      expect(await scopeNames(adminCookie)).toEqual(expect.arrayContaining(['reports:read', 'reports:write']))
      const refused = await fetch(authApi.me.tokens, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': userCookie },
        body: JSON.stringify({ name: 'x', scopes: ['reports:write'] }),
      })
      expect(refused.status).toBe(403)
      expect(await refused.json()).toMatchObject({ data: { code: 'insufficient_permission' } })
    })

    it('caps a token at its user\'s current role', async () => {
      const editor = await register({ name: 'Ed', email: 'ed@example.com', password })
      await setRole('ed@example.com', 'editor')
      const token = await createToken(editor.cookie, ['reports:write'])
      const bearer = { headers: { authorization: `Bearer ${token}` } }
      await expect($fetch('/api/test/staff', bearer)).resolves.toEqual({ staff: true })
      await setRole('ed@example.com', 'user')
      await expect($fetch('/api/test/staff', bearer)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('caps a token by the stored role, not the role the session mapper shows', async () => {
      const editor = await register({ name: 'Mapped', email: 'mapped@example.com', password })
      await setRole('mapped@example.com', 'editor')
      const cookie = await login('mapped@example.com', password)
      // The fixture's mapper shows editors as "Editor", a role that does not exist (it would act as `user`).
      expect(await $fetch('/api/_auth/session', { headers: { cookie } })).toMatchObject({ user: { role: 'Editor' } })
      const token = await createToken(editor.cookie, ['reports:write'])
      await expect($fetch('/api/test/staff', { headers: { authorization: `Bearer ${token}` } })).resolves.toEqual({ staff: true })
      await expect($fetch('/api/test/staff', { headers: { cookie } })).resolves.toEqual({ staff: true })
      await setRole('mapped@example.com', 'user')
    })

    it('treats an unknown stored role as the default role', async () => {
      await setRole('edith@example.com', 'retired')
      const mine = await $fetch<{ role: { name: string } }>('/api/authorization/me/permissions', { headers: { cookie: (await login('edith@example.com', password)) } })
      expect(mine.role.name).toBe('user')
    })

    // The roles admin API (`roles:read`, registered by the module itself: no `aggregateTo`, so admin only).
    describe('roles admin API', () => {
      const asAdmin = () => ({ headers: { cookie: adminCookie } })

      it('is for staff holding roles:read only', async () => {
        await expect($fetch(authorizationApi.admin.roles)).rejects.toMatchObject({ statusCode: 401 })
        await expect($fetch(authorizationApi.admin.roles, { headers: { cookie: userCookie } })).rejects.toMatchObject({ statusCode: 403 })
        await expect($fetch(authorizationApi.admin.role('user'), { headers: { cookie: userCookie } })).rejects.toMatchObject({ statusCode: 403 })
        await expect($fetch(authorizationApi.admin.permissions, { headers: { cookie: userCookie } })).rejects.toMatchObject({ statusCode: 403 })
        expect(await scopeNames(adminCookie)).toContain('roles:read')
        expect(await scopeNames(userCookie)).not.toContain('roles:read')
      })

      it('lists the roles most senior first, with their users', async () => {
        await setRole('ed@example.com', 'editor')
        const roles = await $fetch<AuthorizationRoleSummaryDto[]>(authorizationApi.admin.roles, { headers: { cookie: adminCookie } })
        expect(roles.map(role => role.name)).toEqual(['admin', 'editor', 'user'])
        expect(roles.map(role => role.rank)).toEqual([0, 1, 2])
        const [admin, editor, user] = roles
        expect(admin).toMatchObject({ label: 'Administrator', source: 'built-in', inherits: ['editor'], userCount: 2, isDefault: false })
        expect(editor).toMatchObject({ label: 'Editor', source: 'app', inherits: ['user'], userCount: 1, permissionCount: 2 })
        expect(user).toMatchObject({ isDefault: true, permissionCount: 1 })
        expect(user!.userCount).toBeGreaterThanOrEqual(1)
        expect(admin!.permissionCount).toBeGreaterThanOrEqual(3)
      })

      it('says why a role holds each permission', async () => {
        const editor = await $fetch<AuthorizationRoleDto>(authorizationApi.admin.role('editor'), asAdmin())
        const grant = (role: AuthorizationRoleDto, name: string) => role.permissions.find(permission => permission.name === name)?.grant
        expect(grant(editor, 'reports:write')).toEqual({ via: 'granted' })
        expect(grant(editor, 'reports:read')).toEqual({ via: 'inherited', from: 'user' })
        expect(grant(editor, 'roles:read')).toBeNull()

        const admin = await $fetch<AuthorizationRoleDto>(authorizationApi.admin.role('admin'), asAdmin())
        expect(grant(admin, 'reports:write')).toEqual({ via: 'inherited', from: 'editor' })
        expect(grant(admin, 'roles:read')).toEqual({ via: 'all' })
        expect(admin.permissions.find(permission => permission.name === '*')).toMatchObject({ wildcard: true, grant: { via: 'all' } })
      })

      it('answers 404 for an unknown role', async () => {
        await expectStatus(authorizationApi.admin.role('nope'), 404)
        await expectStatus(authorizationApi.admin.roleUsers('nope'), 404)
      })

      it('lists the users of a role, paginated', async () => {
        const page = await $fetch<AuthorizationRoleUsersPageDto>(authorizationApi.admin.roleUsers('admin'), { ...asAdmin(), query: { pageSize: 1 } })
        expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 })
        expect(page.items).toHaveLength(1)
        expect(Object.keys(page.items[0]!).sort()).toEqual(['email', 'id', 'name'])
        const editors = await $fetch<AuthorizationRoleUsersPageDto>(authorizationApi.admin.roleUsers('editor'), asAdmin())
        expect(editors.items.map(user => user.email)).toEqual(['ed@example.com'])
      })

      it('builds the permission matrix', async () => {
        const matrix = await $fetch<AuthorizationPermissionMatrixDto>(authorizationApi.admin.permissions, asAdmin())
        expect(matrix.roles.map(role => role.name)).toEqual(['admin', 'editor', 'user'])
        const holders = (name: string) => matrix.permissions.find(permission => permission.name === name)?.holders
        expect(holders('reports:write')).toEqual({ admin: { via: 'inherited', from: 'editor' }, editor: { via: 'granted' }, user: null })
        expect(holders('reports:read')).toEqual({ admin: { via: 'inherited', from: 'user' }, editor: { via: 'inherited', from: 'user' }, user: { via: 'aggregated' } })
        expect(holders('roles:read')).toEqual({ admin: { via: 'all' }, editor: null, user: null })
        expect(matrix.permissions.find(permission => permission.name === 'reports:read')).toMatchObject({ resource: 'reports', pii: false })
      })

      async function expectStatus(path: string, status: number) {
        const response = await fetch(path, { headers: { cookie: adminCookie } })
        expect(response.status).toBe(status)
        if (status === 404) expect(await response.json()).toMatchObject({ data: { code: 'not_found' } })
      }
    })
  })
})
