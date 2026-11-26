import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { shortLinksApi } from '../src/runtime/utils/api'
import { shortLinksAccess } from '../src/runtime/access'
import type { ShortLinkDto, ShortLinksPage } from '../src/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const manage = shortLinksAccess.permissions.manage

const json = (cookie: string | undefined, method: ApiMethod, path: string, body?: unknown) => apiClient({ cookie }).fetch(method, path, body)
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.json() as Promise<Json>
}

let counter = 0
async function registerUser(name: string, domain = 'example.com') {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, email: `${name.toLowerCase()}${++counter}@${domain}`, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return { cookie: response.headers.get('set-cookie')! }
}

async function createToken(cookie: string, scopes: string[]) {
  return (await ok(await json(cookie, 'POST', authApi.me.tokens, { name: 'test', scopes }))).token as string
}

/** Opens a short link like a browser would, without following the redirect. */
const visit = (path: string, init: { method?: string, userAgent?: string | null, referer?: string } = {}) => fetch(path, {
  method: init.method ?? 'GET',
  redirect: 'manual',
  headers: {
    ...(init.userAgent === null ? {} : { 'user-agent': init.userAgent ?? BROWSER }),
    ...(init.referer ? { referer: init.referer } : {}),
  },
})

/** Makes links through the server utils, as another module would (fixture route). */
const makeLinks = (links: Json[], subject?: string) => $fetch<Json[]>('/api/test/links', { method: 'POST', body: { links, subject } })
const makeLink = async (link: Json) => (await makeLinks([link]))[0]!
const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`
const hookCalls = () => $fetch<Array<{ code: string, owner: string, refId: string | null, subject: string | null }>>('/api/test/clicks')
const clickRows = (id: string) => $fetch<Json[]>('/api/test/link-clicks', { query: { id } })

describe('short-links (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: { cookie: string }
  const staffCookie = async () => (staff ??= await registerUser('Staff', 'staff.test')).cookie

  describe('server utils', () => {
    it('makes random 7 character codes and short URLs on the base URL', async () => {
      const link = await makeLink({ url: 'https://example.com/apply', owner: { module: 'crew', refId: 'crw_1' } })
      expect(link.code).toMatch(/^[0-9A-Z]{7}$/i)
      expect(link.owner).toEqual({ module: 'crew', refId: 'crw_1' })
      expect(link.shortUrl).toBe(`https://frg.test/l/${link.code}`)
    })

    it('makes many links in order across insert chunks, with subject URLs', async () => {
      const inputs = Array.from({ length: 20 }, (_, i) => ({ url: `https://example.com/item/${i}`, owner: { module: 'campaigns', refId: 'cmp_bulk' } }))
      const links = await makeLinks(inputs, 'dlv_abc')
      expect(links.map(link => link.url)).toEqual(inputs.map(input => input.url))
      expect(new Set(links.map(link => link.code)).size).toBe(20)
      expect(links[0]!.subjectUrl).toBe(`https://frg.test/l/${links[0]!.code}/dlv_abc`)
    })

    it('refuses targets that are not http(s) and taken vanity codes', async () => {
      for (const url of ['javascript:alert(1)', '/relative', 'ftp://example.com', 'https://user:pw@example.com']) {
        await expectApiError(fetch('/api/test/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links: [{ url, owner: { module: 'x' } }] }) }), 400, 'invalid_url')
      }
      const code = unique('vanity')
      await makeLink({ url: 'https://example.com', owner: { module: 'x' }, code })
      await expectApiError(fetch('/api/test/links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links: [{ url: 'https://example.com/2', owner: { module: 'x' }, code }] }) }), 409, 'code_taken')
    })

    it('disables the links of one owner record', async () => {
      const refId = unique('cmp')
      const [a, b] = await makeLinks([
        { url: 'https://example.com/a', owner: { module: 'campaigns', refId } },
        { url: 'https://example.com/b', owner: { module: 'campaigns', refId } },
      ])
      const other = await makeLink({ url: 'https://example.com/c', owner: { module: 'campaigns', refId: `${refId}-other` } })
      const { disabled } = await $fetch<{ disabled: number }>('/api/test/links', { method: 'POST', body: { disable: { module: 'campaigns', refId } } })
      expect(disabled).toBe(2)
      expect((await visit(`/l/${a!.code}`)).status).toBe(404)
      expect((await visit(`/l/${b!.code}`)).status).toBe(404)
      expect((await visit(`/l/${other.code}`)).status).toBe(302)
    })
  })

  describe('redirect', () => {
    it('redirects to the stored URL with 302, counts the click and fires the hook with the subject', async () => {
      const link = await makeLink({ url: 'https://example.com/landing?utm=1', owner: { module: 'campaigns', refId: 'cmp_hook' } })
      const response = await visit(`/l/${link.code}/dlv_token_1`, { referer: 'https://mail.example.net/inbox?id=1' })
      expect(response.status).toBe(302)
      expect(response.headers.get('location')).toBe('https://example.com/landing?utm=1')
      expect(response.headers.get('cache-control')).toContain('no-store')

      const calls = (await hookCalls()).filter(call => call.code === link.code)
      expect(calls).toEqual([{ code: link.code, owner: 'campaigns', refId: 'cmp_hook', subject: 'dlv_token_1' }])
      const rows = await clickRows(link.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ subject: 'dlv_token_1', referrerHost: 'mail.example.net' })
      expect(Object.keys(rows[0]!).sort()).toEqual(['at', 'id', 'linkId', 'referrerHost', 'subject'])

      await visit(`/l/${link.code}`)
      expect((await hookCalls()).filter(call => call.code === link.code).map(call => call.subject)).toEqual(['dlv_token_1', null])
    })

    it('does not count HEAD requests or link scanners, but still redirects them', async () => {
      const link = await makeLink({ url: 'https://example.com/scanned', owner: { module: 'test' } })
      expect((await visit(`/l/${link.code}`, { method: 'HEAD' })).status).toBe(302)
      expect((await visit(`/l/${link.code}`, { userAgent: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' })).status).toBe(302)
      expect((await visit(`/l/${link.code}`, { userAgent: 'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17531; Pro)' })).status).toBe(302)
      expect((await visit(`/l/${link.code}`, { userAgent: null })).status).toBe(302)
      expect((await hookCalls()).filter(call => call.code === link.code)).toEqual([])
      expect(await clickRows(link.id)).toEqual([])
    })

    it('keeps no click rows for a link without tracking, but still counts and fires the hook', async () => {
      const link = await makeLink({ url: 'https://example.com/private', owner: { module: 'test' }, track: false })
      expect((await visit(`/l/${link.code}/sub`)).status).toBe(302)
      expect(await clickRows(link.id)).toEqual([])
      expect((await hookCalls()).filter(call => call.code === link.code)).toHaveLength(1)
    })

    it('answers 404 for unknown, expired and disabled codes and bad subjects', async () => {
      expect((await visit('/l/doesnotexist')).status).toBe(404)
      const expired = await makeLink({ url: 'https://example.com/old', owner: { module: 'test' }, expiresAt: new Date(Date.now() - 60_000).toISOString() })
      expect((await visit(`/l/${expired.code}`)).status).toBe(404)
      const live = await makeLink({ url: 'https://example.com/live', owner: { module: 'test' } })
      expect((await visit(`/l/${live.code}/${'x'.repeat(201)}`)).status).toBe(404)
      expect((await visit(`/l/${live.code}/bad%20subject`)).status).toBe(404)
      // Codes match case-sensitively.
      const swapped = live.code.replace(/[a-z]/i, (c: string) => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())
      if (swapped !== live.code) expect((await visit(`/l/${swapped}`)).status).toBe(404)
    })

    it('never redirects anywhere but the stored URL', async () => {
      const link = await makeLink({ url: 'https://example.com/safe', owner: { module: 'test' } })
      for (const path of [
        `/l/${link.code}?url=https://evil.example`,
        `/l/${link.code}?redirect=//evil.example`,
        `/l/${link.code}/https%3A%2F%2Fevil.example`,
      ]) {
        const response = await visit(path)
        if (response.status === 302) expect(response.headers.get('location')).toBe('https://example.com/safe')
        else expect(response.status).toBe(404)
      }
      for (const path of ['/l/https%3A%2F%2Fevil.example', '/l//evil.example', '/l/..%2F..%2Fevil']) {
        const response = await visit(path)
        expect(response.status).not.toBe(302)
        expect(response.headers.get('location')).toBeNull()
      }
    })

    it('refuses other methods', async () => {
      const link = await makeLink({ url: 'https://example.com/m', owner: { module: 'test' } })
      expect((await visit(`/l/${link.code}`, { method: 'POST' })).status).toBe(405)
    })
  })

  describe('access', () => {
    it('denies the admin API by default: anonymous 401, non-staff 403', async () => {
      const nobody = await registerUser('Nobody')
      expect((await json(undefined, 'GET', shortLinksApi.admin.links)).status).toBe(401)
      expect((await json(undefined, 'POST', shortLinksApi.admin.links, {})).status).toBe(401)
      expect((await json(undefined, 'PATCH', shortLinksApi.admin.link('shl_missing'), {})).status).toBe(401)
      expect((await json(undefined, 'POST', shortLinksApi.admin.disable('shl_missing'))).status).toBe(401)
      await expectApiError(json(nobody.cookie, 'GET', shortLinksApi.admin.links), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', shortLinksApi.admin.links, { url: 'https://example.com' }), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', shortLinksApi.admin.disable('shl_missing')), 403, 'forbidden')
    })

    it('lets a token with short-links:manage use the admin API, and refuses one without it', async () => {
      const cookie = await staffCookie()
      const withPermission = apiClient({ bearer: await createToken(cookie, [manage]) })
      const page = await withPermission.json<ShortLinksPage>('GET', shortLinksApi.admin.links)
      expect(page.total).toBeGreaterThan(0)
      const created = await withPermission.json<ShortLinkDto>('POST', shortLinksApi.admin.links, { url: 'https://example.com/token' })
      expect(created.owner.module).toBe('short-links')

      // Staff, but the token was not given the permission.
      const without = apiClient({ bearer: await createToken(cookie, ['profile:read']) })
      await expectApiError(without.json('GET', shortLinksApi.admin.links), 403, 'insufficient_scope')
      await expectApiError(apiClient({ bearer: 'fnu_invalid' }).json('GET', shortLinksApi.admin.links), 401)
    })
  })

  describe('admin API', () => {
    it('creates, edits, disables and enables a link made by hand', async () => {
      const api = apiClient({ cookie: await staffCookie() })
      const code = unique('spring')
      const created = await api.json<ShortLinkDto>('POST', shortLinksApi.admin.links, { url: 'https://example.com/spring', code, title: 'Spring party' })
      expect(created).toMatchObject({ code, url: 'https://example.com/spring', title: 'Spring party', editable: true, clicks: 0, track: true })
      expect(created.shortUrl).toBe(`https://frg.test/l/${code}`)

      await expectApiError(api.json('POST', shortLinksApi.admin.links, { url: 'https://example.com/dup', code }), 409, 'code_taken')
      await expectApiError(api.json('POST', shortLinksApi.admin.links, { url: 'javascript:alert(1)' }), 400, 'invalid_url')

      const updated = await api.json<ShortLinkDto>('PATCH', shortLinksApi.admin.link(created.id), { url: 'https://example.com/spring-2', title: null })
      expect(updated).toMatchObject({ url: 'https://example.com/spring-2', title: null, code })
      expect((await visit(`/l/${code}`)).headers.get('location')).toBe('https://example.com/spring-2')

      const disabled = await api.json<ShortLinkDto>('POST', shortLinksApi.admin.disable(created.id))
      expect(disabled.disabledAt).not.toBeNull()
      expect((await visit(`/l/${code}`)).status).toBe(404)
      await api.json('POST', shortLinksApi.admin.enable(created.id))
      expect((await visit(`/l/${code}`)).status).toBe(302)

      await expectApiError(api.json('PATCH', shortLinksApi.admin.link('shl_missing'), { title: 'x' }), 404)
    })

    it('keeps links of other modules read-only except disabling', async () => {
      const api = apiClient({ cookie: await staffCookie() })
      const owned = await makeLink({ url: 'https://example.com/owned', owner: { module: 'campaigns', refId: 'cmp_owned' } })
      await expectApiError(api.json('PATCH', shortLinksApi.admin.link(owned.id), { url: 'https://example.com/hijack' }), 409, 'owned_link')
      const disabled = await api.json<ShortLinkDto>('POST', shortLinksApi.admin.disable(owned.id))
      expect(disabled).toMatchObject({ editable: false, owner: { module: 'campaigns', refId: 'cmp_owned' } })
      expect(disabled.disabledAt).not.toBeNull()
    })

    it('lists with owner and status filters, search and sorting', async () => {
      const api = apiClient({ cookie: await staffCookie() })
      const module = unique('mod')
      const [first] = await makeLinks([
        { url: 'https://example.com/one', owner: { module }, title: 'Needle one' },
        { url: 'https://example.com/two', owner: { module } },
      ])
      await visit(`/l/${first!.code}`)
      await visit(`/l/${first!.code}`)

      const byOwner = await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?owner=${module}&sort=clicks&order=desc`)
      expect(byOwner.total).toBe(2)
      expect(byOwner.items[0]).toMatchObject({ code: first!.code, clicks: 2 })
      expect(byOwner.items[0]!.lastClickedAt).not.toBeNull()

      const search = await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?owner=${module}&q=needle`)
      expect(search.items.map(item => item.code)).toEqual([first!.code])

      await api.json('POST', shortLinksApi.admin.disable(first!.id))
      const active = await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?owner=${module}&status=active`)
      expect(active.total).toBe(1)
      const disabled = await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?owner=${module}&status=disabled`)
      expect(disabled.items.map(item => item.code)).toEqual([first!.code])

      expect(await api.json<string[]>('GET', shortLinksApi.admin.owners)).toContain(module)
    })

    it('splits links made by hand from links modules made', async () => {
      const api = apiClient({ cookie: await staffCookie() })
      const needle = unique('src')
      const byHand = await api.json<ShortLinkDto>('POST', shortLinksApi.admin.links, { url: `https://example.com/${needle}` })
      const byModule = await makeLink({ url: `https://example.com/${needle}`, owner: { module: 'campaigns' } })
      const manual = await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?source=manual&q=${needle}`)
      expect(manual.items.map(item => item.id)).toEqual([byHand.id])
      const modules = await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?source=modules&q=${needle}`)
      expect(modules.items.map(item => item.id)).toEqual([byModule.id])
    })

    it('renders the admin page for staff', async () => {
      const response = await fetch('/admin/short-links', { headers: { cookie: await staffCookie() } })
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('Short links')
    })
  })

  describe('retention', () => {
    it('deletes click rows past the retention period and keeps the counter', async () => {
      const link = await makeLink({ url: 'https://example.com/retained', owner: { module: 'test' } })
      await visit(`/l/${link.code}`)
      expect(await clickRows(link.id)).toHaveLength(1)
      await $fetch('/api/test/retention', { method: 'POST', body: { now: new Date(Date.now() + 366 * 86_400_000).toISOString() } })
      expect(await clickRows(link.id)).toEqual([])
      const api = apiClient({ cookie: await staffCookie() })
      const page = await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?q=${link.code}`)
      expect(page.items[0]?.clicks).toBe(1)
    })

    it('deletes links with autoDelete once they have been expired or disabled long enough', async () => {
      const ago = new Date(Date.now() - 60_000).toISOString()
      const needle = unique('auto')
      const [expired, disabled, kept, open] = await makeLinks([
        { url: `https://example.com/${needle}/a`, owner: { module: 'test' }, expiresAt: ago, autoDelete: true },
        { url: `https://example.com/${needle}/b`, owner: { module: 'test' }, autoDelete: true },
        { url: `https://example.com/${needle}/c`, owner: { module: 'test' }, expiresAt: ago },
        { url: `https://example.com/${needle}/d`, owner: { module: 'test' }, autoDelete: true },
      ])
      expect(expired).toMatchObject({ autoDelete: true })
      const api = apiClient({ cookie: await staffCookie() })
      await api.json('POST', shortLinksApi.admin.disable(disabled!.id))

      const run = (days: number) => $fetch<{ result: { links: number } }>('/api/test/retention', { method: 'POST', body: { now: new Date(Date.now() + days * 86_400_000).toISOString() } })
      // Within the 30 day grace period nothing goes.
      await run(10)
      const listed = async () => (await api.json<ShortLinksPage>('GET', `${shortLinksApi.admin.links}?q=${needle}`)).items.map(item => item.id)
      expect(await listed()).toEqual(expect.arrayContaining([expired!.id, disabled!.id]))

      await run(31)
      const ids = await listed()
      expect(ids).not.toContain(expired!.id)
      expect(ids).not.toContain(disabled!.id)
      expect(ids).toEqual(expect.arrayContaining([kept!.id, open!.id]))
      expect((await visit(`/l/${expired!.code}`)).status).toBe(404)
    })

    it('deletes every link of an owner with deleteShortLinks', async () => {
      const refId = unique('cmp')
      const [link] = await makeLinks([{ url: 'https://example.com/x', owner: { module: 'campaigns', refId } }])
      await visit(`/l/${link!.code}`)
      expect(await $fetch('/api/test/links', { method: 'POST', body: { delete: { module: 'campaigns', refId } } })).toEqual({ deleted: 1 })
      expect(await clickRows(link!.id)).toEqual([])
      expect((await visit(`/l/${link!.code}`)).status).toBe(404)
    })
  })
})
