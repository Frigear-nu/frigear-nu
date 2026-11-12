import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { authApi } from '@frigear-nu/auth/api'
import type { AccessDto } from '@frigear-nu/auth/policies'
import { authorizationApi } from '../src/runtime/utils/api'
import type { AuthorizationRoleDto, AuthorizationRoleSummaryDto, AuthorizationRoleUsersPageDto, AuthorizationUserRolesDto } from '../src/runtime/utils/api'

const password = 'supersecret123'

async function register(name: string, email: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  })
  const body = await response.text()
  expect(response.status, body).toBe(201)
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie after registering.')
  return { cookie, id: (JSON.parse(body) as { id: number }).id }
}

const as = (cookie?: string) => ({ headers: cookie ? { cookie } : {} })
const seedRoles = (email: string, roles: string[], source: 'manual' | 'sso' | 'migrated' = 'manual') =>
  $fetch('/api/test/roles', { method: 'POST', body: { email, roles, source } })
const access = (cookie: string) => $fetch<AccessDto>(authApi.me.access, as(cookie))

async function putRoles(cookie: string, id: number, roles: string[]) {
  return fetch(authorizationApi.admin.userRoles(id), {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ roles }),
  })
}

async function expectError(response: Response, status: number, code?: string) {
  const body = await response.text()
  expect(response.status, body).toBe(status)
  if (code) expect(JSON.parse(body)).toMatchObject({ data: { code } })
  return body
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

  let ada: { cookie: string, id: number }
  let grace: { cookie: string, id: number }

  it('gives new users the default role, and an admin through the role provider', async () => {
    ada = await register('Ada', 'ada@example.com')
    grace = await register('Grace', 'grace@example.com')
    await seedRoles('grace@example.com', ['admin'])

    const mine = await access(ada.cookie)
    expect(mine).toMatchObject({ kind: 'session', roles: ['user'] })
    expect(mine.permissions).toContain('reports:read')
    expect(mine.permissions).not.toContain('reports:write')

    // Roles are read fresh: no new sign-in needed.
    const admin = await access(grace.cookie)
    expect(admin.roles).toEqual(expect.arrayContaining(['admin', 'user']))
    expect(admin.permissions).toEqual(expect.arrayContaining(['admin:access', 'reports:write', 'roles:assign', 'roles:read']))
  })

  it('gives `auto` roles to everyone meeting their requirements', async () => {
    const member = await register('Meg', 'meg@member.test')
    const mine = await access(member.cookie)
    expect(mine.roles).toEqual(expect.arrayContaining(['member', 'user']))
    expect(mine.permissions).toContain('member-area:view')
    expect((await access(ada.cookie)).permissions).not.toContain('member-area:view')
  })

  describe('route rules', () => {
    const page = (path: string, cookie?: string) => fetch(path, as(cookie))

    it('gates pages by permission, including during SSR', async () => {
      expect((await page('/admin')).status).toBe(401)
      expect((await page('/admin', ada.cookie)).status).toBe(403)
      const ok = await page('/admin', grace.cookie)
      expect(ok.status).toBe(200)
      expect(await ok.text()).toContain('admin-area')
    })

    it('lets a more specific `authenticated: false` rule open a sub-route', async () => {
      const response = await page('/admin/public')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('admin-public-page')
    })

    it('lets definePageMeta({ authorize }) replace config rules', async () => {
      expect((await page('/meta-override')).status).toBe(200)
      expect((await page('/editor-meta')).status).toBe(401)
      expect((await page('/editor-meta', ada.cookie)).status).toBe(403)
      expect((await page('/editor-meta', grace.cookie)).status).toBe(200)
    })

    it('gates the API by permission (auth\'s server middleware)', async () => {
      await expect($fetch('/api/admin/stats')).rejects.toMatchObject({ statusCode: 401 })
      await expect($fetch('/api/admin/stats', as(ada.cookie))).rejects.toMatchObject({ statusCode: 403 })
      await expect($fetch('/api/admin/stats', as(grace.cookie))).resolves.toEqual({ secret: 42 })
      await expect($fetch('/api/members')).rejects.toMatchObject({ statusCode: 401 })
      await expect($fetch('/api/members', as(ada.cookie))).resolves.toEqual({ members: true })
    })
  })

  describe('<Can> / <Cannot>', () => {
    it('renders from the access fetched during SSR, with shared policies on records', async () => {
      const guest = await $fetch<string>('/')
      expect(guest).toContain('cannot-write')
      expect(guest).not.toContain('can-read-own')
      expect(guest).toContain('not-a-member')

      const user = await $fetch<string>('/', as(ada.cookie))
      expect(user).toContain('cannot-write')
      // `shared/policies.ts`: reports are readable by their owner only.
      expect(user).toContain('can-read-own')
      expect(user).not.toContain('can-read-other')

      expect(await $fetch<string>('/', as(grace.cookie))).toContain('can-write')
    })
  })

  describe('roles admin API', () => {
    it('is for staff holding roles:read only', async () => {
      for (const route of [authorizationApi.admin.roles, authorizationApi.admin.role('user'), authorizationApi.admin.roleUsers('admin'), authorizationApi.admin.userRoles(ada.id)]) {
        await expectError(await fetch(route), 401, 'unauthorized')
        await expectError(await fetch(route, as(ada.cookie)), 403, 'forbidden')
        expect((await fetch(route, as(grace.cookie))).status, route).toBe(200)
      }
    })

    it('lists the configured roles and how each is held', async () => {
      const roles = await $fetch<AuthorizationRoleSummaryDto[]>(authorizationApi.admin.roles, as(grace.cookie))
      const byName = Object.fromEntries(roles.map(role => [role.name, role]))
      expect(Object.keys(byName).sort()).toEqual(['admin', 'editor', 'member', 'user'])
      expect(byName.admin).toMatchObject({ label: 'Admin', assignable: true, default: false, auto: false })
      expect(byName.user).toMatchObject({ default: true, assignable: false, userCount: 0 })
      expect(byName.member).toMatchObject({ auto: true, assignable: false, requirements: ['verified'] })
      expect(byName.editor).toMatchObject({ inherit: ['user'], inherited: ['user'], permissionCount: 4 })
      expect(byName.admin!.userCount).toBeGreaterThanOrEqual(1)
    })

    it('says why a role holds each permission, and 404s an unknown role', async () => {
      const editor = await $fetch<AuthorizationRoleDto>(authorizationApi.admin.role('editor'), as(grace.cookie))
      const grant = (name: string) => editor.permissions.find(permission => permission.name === name)?.grant
      expect(grant('reports:write')).toEqual({ via: 'granted', by: 'reports:write' })
      expect(grant('reports:read')).toEqual({ via: 'inherited', from: 'user', by: 'reports:read' })
      expect(grant('admin:access')).toBeNull()
      expect(editor.permissions.find(permission => permission.name === 'roles:assign')).toMatchObject({ sessionOnly: true })

      await expectError(await fetch(authorizationApi.admin.role('nope'), as(grace.cookie)), 404, 'not_found')
      await expectError(await fetch(authorizationApi.admin.roleUsers('nope'), as(grace.cookie)), 404, 'not_found')
    })

    it('lists the users a role is assigned to', async () => {
      const page = await $fetch<AuthorizationRoleUsersPageDto>(authorizationApi.admin.roleUsers('admin'), { ...as(grace.cookie), query: { pageSize: 1 } })
      expect(page).toMatchObject({ total: 1, page: 1, pageSize: 1 })
      expect(page.items[0]).toMatchObject({ email: 'grace@example.com', source: 'manual' })
      expect(Object.keys(page.items[0]!).sort()).toEqual(['assignedAt', 'email', 'id', 'name', 'source'])
    })
  })

  describe('role assignment', () => {
    let edith: { cookie: string, id: number }

    it('lets an admin assign and remove roles', async () => {
      edith = await register('Edith', 'edith@example.com')
      const response = await putRoles(grace.cookie, edith.id, ['editor'])
      expect(response.status, await response.clone().text()).toBe(200)
      const roles = await response.json() as AuthorizationUserRolesDto
      expect(roles.assigned).toEqual([expect.objectContaining({ role: 'editor', source: 'manual', grantedBy: grace.id, known: true })])
      expect(roles.effective).toEqual(['editor', 'user'])
      expect(roles.permissions).toEqual(expect.arrayContaining(['reports:write', 'roles:assign']))
      expect((await access(edith.cookie)).permissions).toContain('reports:write')
    })

    it('only lets staff assign roles within their own permissions (403)', async () => {
      const mine = await $fetch<AuthorizationUserRolesDto>(authorizationApi.admin.userRoles(ada.id), as(edith.cookie))
      expect(mine.assignable).toEqual(['editor'])
      await expectError(await putRoles(edith.cookie, ada.id, ['admin']), 403, 'forbidden')
      await expectError(await putRoles(edith.cookie, grace.id, []), 403, 'forbidden')
      expect((await putRoles(edith.cookie, ada.id, ['editor'])).status).toBe(200)
      expect((await putRoles(edith.cookie, ada.id, [])).status).toBe(200)
      // Users without `roles:assign` cannot assign at all.
      await expectError(await putRoles(ada.cookie, ada.id, ['editor']), 403, 'forbidden')
    })

    it('answers 409 role_not_assignable for default and auto roles, 400 for unknown ones', async () => {
      await expectError(await putRoles(grace.cookie, ada.id, ['member']), 409, 'role_not_assignable')
      await expectError(await putRoles(grace.cookie, ada.id, ['user']), 409, 'role_not_assignable')
      await expectError(await putRoles(grace.cookie, ada.id, ['ghost']), 400, 'unknown_role')
      await expectError(await putRoles(grace.cookie, 999_999, []), 404, 'not_found')
    })

    it('is session only: a bearer token cannot assign roles', async () => {
      const created = await fetch(authApi.me.tokens, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': grace.cookie },
        body: JSON.stringify({ name: 'roles', scopes: ['*'] }),
      })
      expect(created.status, await created.clone().text()).toBe(201)
      const { token } = await created.json() as { token: string }
      const response = await fetch(authorizationApi.admin.userRoles(ada.id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
        body: JSON.stringify({ roles: ['editor'] }),
      })
      expect(response.status).toBe(403)
    })
  })

  describe('single sign-on rows (role provider `setRoles`)', () => {
    it('replaces only rows of its own source', async () => {
      const mo = await register('Mo', 'mo@example.com')
      expect((await putRoles(grace.cookie, mo.id, ['editor'])).status).toBe(200)

      await seedRoles('mo@example.com', ['editor', 'admin'], 'sso')
      let roles = await $fetch<AuthorizationUserRolesDto>(authorizationApi.admin.userRoles(mo.id), as(grace.cookie))
      expect(roles.assigned.map(row => [row.role, row.source]).sort()).toEqual([['admin', 'sso'], ['editor', 'manual']])

      // Staff edits leave single sign-on rows alone...
      roles = await (await putRoles(grace.cookie, mo.id, [])).json() as AuthorizationUserRolesDto
      expect(roles.assigned.map(row => [row.role, row.source])).toEqual([['admin', 'sso']])

      // ...and single sign-on leaves the manual ones alone.
      expect((await putRoles(grace.cookie, mo.id, ['editor'])).status).toBe(200)
      await seedRoles('mo@example.com', [], 'sso')
      roles = await $fetch<AuthorizationUserRolesDto>(authorizationApi.admin.userRoles(mo.id), as(grace.cookie))
      expect(roles.assigned.map(row => [row.role, row.source])).toEqual([['editor', 'manual']])
    })
  })

  describe('the users.role migration', () => {
    it('copies users.role once, and a removed role never comes back', async () => {
      const linus = await register('Linus', 'linus@example.com')
      await $fetch('/api/test/legacy-role', { method: 'POST', body: { email: 'linus@example.com', role: 'editor' } })
      await $fetch('/api/test/legacy-role', { method: 'POST', body: { email: 'ada@example.com', role: 'retired' } })
      // The first request already ran it (marker set): nothing is read again.
      expect(await $fetch('/api/test/role-migration', { method: 'POST', body: {} })).toMatchObject({ skipped: true, copied: 0 })

      // As on a database that still holds `users.role`: the copy runs, keeps unknown roles and reports them.
      const result = await $fetch<{ skipped: boolean, copied: number, unknown: string[] }>('/api/test/role-migration', { method: 'POST', body: { reset: true } })
      expect(result).toMatchObject({ skipped: false, unknown: ['retired'] })
      expect(result.copied).toBeGreaterThanOrEqual(2)

      let roles = await $fetch<AuthorizationUserRolesDto>(authorizationApi.admin.userRoles(linus.id), as(grace.cookie))
      expect(roles.assigned).toEqual([expect.objectContaining({ role: 'editor', source: 'migrated', known: true })])
      expect(roles.effective).toContain('editor')
      const adas = await $fetch<AuthorizationUserRolesDto>(authorizationApi.admin.userRoles(ada.id), as(grace.cookie))
      expect(adas.assigned).toEqual([expect.objectContaining({ role: 'retired', known: false })])
      expect(adas.effective).toEqual(['user'])

      expect((await putRoles(grace.cookie, linus.id, [])).status).toBe(200)
      expect(await $fetch('/api/test/role-migration', { method: 'POST', body: {} })).toMatchObject({ skipped: true })
      roles = await $fetch<AuthorizationUserRolesDto>(authorizationApi.admin.userRoles(linus.id), as(grace.cookie))
      expect(roles.assigned).toEqual([])
      expect((await access(linus.cookie)).roles).toEqual(['user'])
    })
  })
})
