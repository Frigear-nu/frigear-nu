import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

async function register(payload: { name: string, email: string, password: string }) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.text()
  expect(response.status, body).toBe(200)
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
    dev: true,
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
})
