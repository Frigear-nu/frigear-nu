import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { registerUser } from './helpers'
import type { FormDefinition } from '../src/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const json = (cookie: string | undefined, method: string, path: string, body?: unknown) => fetch(path, {
  method,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.json() as Promise<Json>
}

const stepped: FormDefinition = {
  mode: 'stepped',
  storage: 'db',
  steps: [
    { id: 'who', fields: [
      { key: 'name', type: 'text', required: true },
      { key: 'kind', type: 'radio', required: true, options: [{ value: 'org', label: { en: 'Organisation', da: 'Organisation' } }, { value: 'person', label: 'Person' }] },
    ] },
    { id: 'org', showIf: { field: 'kind', op: 'eq', value: 'org' }, fields: [{ key: 'orgName', type: 'text', required: true }] },
    { id: 'files', fields: [
      { key: 'logo', type: 'file', multiple: true, validation: { maxSize: 1000, accept: ['image/*', 'text/plain'] } },
      { key: 'terms', type: 'checkbox', required: true },
    ] },
  ],
}

let counter = 0
const slug = (prefix: string) => `${prefix.toLowerCase().replaceAll(' ', '-')}-${++counter}`

async function mcpRpc(bearer: string, method: string, params: Json = {}) {
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept': 'application/json, text/event-stream', 'authorization': `Bearer ${bearer}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await response.text()
  const payload = text.trimStart().startsWith('{') ? text : text.split('\n').find(line => line.startsWith('data:'))?.slice(5) ?? '{}'
  return JSON.parse(payload) as { result?: Json, error?: Json }
}

const mcpNames = async (bearer: string) => ((await mcpRpc(bearer, 'tools/list')).result?.tools ?? []).map((tool: { name: string }) => tool.name).sort() as string[]
const mcpCall = (bearer: string, name: string, args: Json = {}) => mcpRpc(bearer, 'tools/call', { name, arguments: args })
const mcpText = (response: { result?: Json, error?: Json }) => JSON.stringify(response)

async function scopesFor(cookie: string) {
  const response = await fetch('/api/auth/scopes', { headers: { cookie } })
  expect(response.status).toBe(200)
  return (await response.json() as Array<{ name: string }>).map(scope => scope.name)
}

async function tokenStatus(cookie: string, scopes: string[]) {
  const response = await fetch('/api/auth/tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'probe', scopes }),
  })
  return response.status
}

async function mcpToken(cookie: string, scopes: string[]) {
  const response = await fetch('/api/auth/tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'MCP', scopes }),
  })
  expect(response.status, await response.clone().text()).toBe(200)
  return (await response.json() as { token: string }).token
}

const definition = { mode: 'single', storage: 'db', steps: [{ id: 's', fields: [{ key: 'secret', type: 'text', required: true }] }] }

describe('forms (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: { cookie: string }
  let nobody: { cookie: string }
  beforeAll(async () => {
    staff = await registerUser('Staff', 'staff@staff.test')
    nobody = await registerUser('Nobody', 'nobody@example.com')
  })

  const create = async (name: string, definition: FormDefinition, status = 'published') =>
    ok(await json(staff.cookie, 'POST', '/api/forms/admin/forms', { slug: slug(name), name, status, definition }))
  const submit = (formSlug: string, answers: Json, cookie?: string) =>
    json(cookie, 'POST', `/api/forms/${formSlug}/submit`, { answers, locale: 'en' })
  const counts = () => $fetch<{ submissions: number, files: number }>('/api/test/counts')

  describe('staff gate', () => {
    it('denies by default: anonymous 401, non-staff 403', async () => {
      expect((await json(undefined, 'GET', '/api/forms/admin/forms')).status).toBe(401)
      expect((await json(nobody.cookie, 'GET', '/api/forms/admin/forms')).status).toBe(403)
      expect((await json(nobody.cookie, 'POST', '/api/forms/admin/import', { forms: [] })).status).toBe(403)
    })

    it('rejects invalid definitions and reserved slugs', async () => {
      const bad = await json(staff.cookie, 'POST', '/api/forms/admin/forms', {
        slug: 'bad', name: 'Bad', definition: { mode: 'single', storage: 'none', steps: [{ id: 's', fields: [{ key: 'f', type: 'file' }] }] },
      })
      expect(bad.status).toBe(400)
      const reserved = await json(staff.cookie, 'POST', '/api/forms/admin/forms', {
        slug: 'admin', name: 'Admin', definition: { mode: 'single', steps: [{ id: 's', fields: [] }] },
      })
      expect(reserved.status).toBe(400)
    })
  })

  describe('public form', () => {
    it('serves only published forms, without delivery details', async () => {
      const form = await create('Public', {
        ...stepped,
        delivery: { email: { to: ['hidden@example.com'] } },
      })
      const publicForm = await ok(await json(undefined, 'GET', `/api/forms/${form.slug}`))
      expect(publicForm.definition.steps).toHaveLength(3)
      expect(publicForm.definition).not.toHaveProperty('delivery')

      const draft = await create('Draft', stepped, 'draft')
      expect((await json(undefined, 'GET', `/api/forms/${draft.slug}`)).status).toBe(404)
      expect((await json(undefined, 'GET', '/api/forms/nope')).status).toBe(404)
      expect((await submit(draft.slug, {})).status).toBe(404)
    })
  })

  describe('pages', () => {
    // The first server render in dev mode compiles the page, which can exceed the 5s default on a busy CI runner.
    it('server-renders the public form and the admin shells', { timeout: 30_000 }, async () => {
      const form = await create('Rendered', {
        mode: 'stepped',
        storage: 'db',
        steps: [{ id: 'one', title: { en: 'Step title' }, fields: [{ key: 'name', type: 'text', label: { en: 'Your name' }, required: true }] }, { id: 'two', fields: [] }],
      })
      const html = await $fetch<string>(`/forms/${form.slug}`)
      expect(html).toContain('Rendered')
      expect(html).toContain('Step 1 of 2')
      expect(html).toContain('Step title')
      expect(html).toContain('Your name')

      expect(await $fetch<string>('/forms/does-not-exist')).toContain('This form could not be found.')
      // Anonymous: the shell renders and shows the "not allowed" state (the API answers 401).
      const admin = await fetch('/admin/forms')
      const adminHtml = await admin.text()
      expect(admin.status, adminHtml.slice(0, 600)).toBe(200)
      expect(adminHtml).toContain('You are not allowed to manage forms.')
    })
  })

  describe('FormEmbed', () => {
    const embed = (formSlug: string, title = false) => $fetch<string>(`/embed?slug=${formSlug}${title ? '&title=1' : ''}`)

    it('renders a published form inline, optionally with its name', async () => {
      const form = await create('Embedded', { mode: 'single', storage: 'db', steps: [{ id: 'one', fields: [{ key: 'name', type: 'text', label: { en: 'Your name' } }] }] })
      const html = await embed(form.slug)
      expect(html).toContain('data-form-embed')
      expect(html).toContain('not-prose')
      expect(html).toContain('Your name')
      expect(html).not.toContain('<h2 class="mb-4')
      expect(await embed(form.slug, true)).toContain('Embedded')
    })

    it('fails gracefully for unknown and unpublished slugs', async () => {
      const draft = await create('Embedded draft', stepped, 'draft')
      for (const missing of ['does-not-exist', draft.slug]) {
        const html = await embed(missing)
        expect(html).toContain('This form could not be found.')
        expect(html).toContain('after')
      }
    })

    it('renders nothing for API-only forms and a sign-in prompt for user forms', async () => {
      const api = await create('Embedded api', { ...stepped, access: { availability: 'api', auth: 'none' } })
      expect(await embed(api.slug)).not.toContain('data-form-embed')
      const user = await create('Embedded user', { ...stepped, access: { availability: 'web', auth: 'user' } })
      expect(await embed(user.slug)).toContain('Sign in to use this form')
    })
  })

  describe('submitting (storage: db)', () => {
    it('validates the whole form, skipping hidden steps', async () => {
      const form = await create('Stepped', stepped)

      const empty = await submit(form.slug, {})
      expect(empty.status).toBe(422)
      const { data } = await empty.json() as Json
      expect(data.issues.map((issue: Json) => issue.path[0]).sort()).toEqual(['kind', 'name', 'terms'])

      // `org` step is only required when kind = org.
      expect((await submit(form.slug, { name: 'Ada', kind: 'org', terms: true })).status).toBe(422)
      expect((await submit(form.slug, { name: 'Ada', kind: 'person', terms: true, orgName: 'stale' })).status).toBe(200)
    })

    it('requires a field shown by notEmpty / empty conditions only when visible', async () => {
      const form = await create('Empty ops', { mode: 'single', storage: 'db', steps: [{ id: 's', fields: [
        { key: 'phone', type: 'text' },
        { key: 'why', type: 'text', required: true, showIf: { field: 'phone', op: 'empty' } },
        { key: 'when', type: 'text', required: true, showIf: { field: 'phone', op: 'notEmpty' } },
      ] }] })
      const missing = async (answers: Json) => {
        const response = await submit(form.slug, answers)
        if (response.status === 200) return []
        return ((await response.json() as Json).data.issues as Json[]).map(issue => issue.path[0])
      }
      expect(await missing({})).toEqual(['why'])
      expect(await missing({ phone: '123' })).toEqual(['when'])
      expect(await missing({ phone: '123', when: 'now' })).toEqual([])
    })

    it('stores answers with the definition snapshot and the signed-in user', async () => {
      const form = await create('Stored', stepped)
      const response = await ok(await submit(form.slug, { name: 'Ada', kind: 'org', orgName: 'Acme', terms: true, injected: 1 }, nobody.cookie))
      expect(response.id).toMatch(/^fsb_/)

      const detail = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/submissions/${response.id}`))
      expect(detail.answers).toEqual({ name: 'Ada', kind: 'org', orgName: 'Acme', terms: true, logo: [] })
      expect(detail.definition.steps).toHaveLength(3)
      expect(detail.formVersion).toBe(1)
      expect(detail.userId).toBeTypeOf('number')
      expect(detail.deliveryStatus).toBe('none')

      const list = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/forms/${form.id}/submissions`))
      expect(list).toHaveLength(1)
      expect(list[0].preview[0]).toEqual({ label: 'name', value: 'Ada' })
    })

    it('keeps the snapshot when the definition is edited later', async () => {
      const form = await create('Versioned', stepped)
      const { id } = await ok(await submit(form.slug, { name: 'Ada', kind: 'person', terms: true }))

      const edited = structuredClone(stepped)
      edited.steps[0]!.fields.push({ key: 'extra', type: 'text', required: true })
      const patched = await ok(await json(staff.cookie, 'PATCH', `/api/forms/admin/forms/${form.id}`, { definition: edited }))
      expect(patched.version).toBe(2)
      // Same definition again does not bump the version.
      expect((await ok(await json(staff.cookie, 'PATCH', `/api/forms/admin/forms/${form.id}`, { definition: edited }))).version).toBe(2)

      const detail = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/submissions/${id}`))
      expect(detail.formVersion).toBe(1)
      expect(detail.definition.steps[0].fields.map((field: Json) => field.key)).toEqual(['name', 'kind'])
      expect((await submit(form.slug, { name: 'Ada', kind: 'person', terms: true })).status).toBe(422)
    })

    it('uploads files, enforces limits and serves them to staff only', async () => {
      const form = await create('Files', stepped)
      const send = (files: { name: string, type: string, content: string }[]) => {
        const body = new FormData()
        body.append('answers', JSON.stringify({ name: 'Ada', kind: 'person', terms: true }))
        body.append('locale', 'en')
        for (const file of files) body.append('file:logo', new File([file.content], file.name, { type: file.type }))
        return fetch(`/api/forms/${form.slug}/submit`, { method: 'POST', body })
      }

      expect((await send([{ name: 'big.txt', type: 'text/plain', content: 'x'.repeat(2000) }])).status).toBe(422)
      expect((await send([{ name: 'a.pdf', type: 'application/pdf', content: 'x' }])).status).toBe(422)

      const { id } = await ok(await send([{ name: 'notes.txt', type: 'text/plain', content: 'hello' }]))
      const detail = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/submissions/${id}`))
      expect(detail.files).toHaveLength(1)
      expect(detail.answers.logo).toEqual([{ name: 'notes.txt', size: 5, type: 'text/plain' }])

      const url = `/api/forms/admin/submissions/${id}/files/${detail.files[0].id}`
      expect((await json(undefined, 'GET', url)).status).toBe(401)
      expect((await json(nobody.cookie, 'GET', url)).status).toBe(403)
      const download = await json(staff.cookie, 'GET', url)
      expect(download.status).toBe(200)
      expect(await download.text()).toBe('hello')
      expect(download.headers.get('content-disposition')).toContain('notes.txt')
    })
  })

  describe('access control', () => {
    const open: FormDefinition = { mode: 'single', storage: 'db', steps: [{ id: 'main', fields: [{ key: 'message', type: 'text', required: true }] }] }
    const withAccess = (access: FormDefinition['access']): FormDefinition => ({ ...open, access })
    const answers = { message: 'hi' }
    const headers = (extra: Record<string, string>) => ({ 'content-type': 'application/json', ...extra })
    const post = (formSlug: string, extra: Record<string, string> = {}) =>
      fetch(`/api/forms/${formSlug}/submit`, { method: 'POST', headers: headers(extra), body: JSON.stringify({ answers, locale: 'en' }) })
    const get = (formSlug: string, extra: Record<string, string> = {}) => fetch(`/api/forms/${formSlug}`, { headers: extra })

    it('keeps definitions without access open (default)', async () => {
      const form = await create('No access', open)
      expect((await post(form.slug)).status).toBe(200)
      expect((await ok(await get(form.slug))).definition.access).toBeUndefined()
      const info = await ok(await fetch(`/api/forms/${form.slug}/access`))
      expect(info.access).toEqual({ availability: 'web', auth: 'none' })
      expect(await $fetch<string>(`/forms/${form.slug}`)).toContain('No access')
    })

    it('closes a form outside its schedule and reopens it inside', async () => {
      const day = 86400000
      const range = (from: number, to: number) => ({ type: 'range' as const, from: new Date(Date.now() + from).toISOString(), to: new Date(Date.now() + to).toISOString() })

      const early = await create('Not yet open', withAccess({ availability: 'web', auth: 'none', schedule: range(day, 2 * day) }))
      const closed = await get(early.slug)
      expect(closed.status).toBe(403)
      expect((await post(early.slug)).status).toBe(403)
      const info = await ok(await fetch(`/api/forms/${early.slug}/access`))
      expect(info.open).toBe(false)
      expect(info.opensAt).toBeTruthy()

      const current = await create('Open now', withAccess({ availability: 'web', auth: 'none', schedule: range(-day, day) }))
      expect((await post(current.slug)).status).toBe(200)
      expect((await ok(await fetch(`/api/forms/${current.slug}/access`))).open).toBe(true)

      const yearly = await create('Every year', withAccess({
        availability: 'web',
        auth: 'none',
        schedule: { type: 'yearly', timezone: 'UTC', from: { month: 1, day: 1, time: '00:00' }, to: { month: 12, day: 31, time: '23:59' } },
      }))
      expect((await post(yearly.slug)).status).toBe(200)
    })

    it('clones a form as a draft with a fresh slug', async () => {
      const original = await create('Cloneable', open)
      const copy = await ok(await json(staff.cookie, 'POST', `/api/forms/admin/forms/${original.id}/clone`))
      expect(copy.id).not.toBe(original.id)
      expect(copy.slug).toBe(`${original.slug}-copy`)
      expect(copy.status).toBe('draft')
      expect(copy.definition).toEqual(original.definition)
      const again = await ok(await json(staff.cookie, 'POST', `/api/forms/admin/forms/${original.id}/clone`))
      expect(again.slug).toBe(`${original.slug}-copy-2`)
      expect((await json(nobody.cookie, 'POST', `/api/forms/admin/forms/${original.id}/clone`)).status).toBe(403)
      expect((await json(staff.cookie, 'POST', '/api/forms/admin/forms/nope/clone')).status).toBe(404)
    })

    it('rejects token access on a form that is not API only', async () => {
      const bad = await json(staff.cookie, 'POST', '/api/forms/admin/forms', { slug: slug('bad-token'), name: 'Bad', definition: withAccess({ availability: 'web', auth: 'token' }) })
      expect(bad.status).toBe(400)
    })

    it('api-only forms have no public page but the API still works', async () => {
      const form = await create('Api only', withAccess({ availability: 'api', auth: 'none' }))
      expect((await fetch(`/forms/${form.slug}`)).status).toBe(404)
      expect((await get(form.slug)).status).toBe(200)
      expect((await post(form.slug)).status).toBe(200)
    })

    it('user: needs a session', async () => {
      const form = await create('Users only', withAccess({ availability: 'web', auth: 'user' }))
      expect((await post(form.slug)).status).toBe(401)
      expect((await get(form.slug)).status).toBe(401)
      expect((await post(form.slug, { cookie: nobody.cookie })).status).toBe(200)
      expect((await get(form.slug, { cookie: nobody.cookie })).status).toBe(200)
      expect((await ok(await fetch(`/api/forms/${form.slug}/access`, { headers: { cookie: nobody.cookie } }))).signedIn).toBe(true)
    })

    it('token: wrong 401, right 200 (bearer or header), revoked 401, secrets never leak', async () => {
      const form = await create('Token form', withAccess({ availability: 'api', auth: 'token' }))
      expect((await post(form.slug)).status).toBe(401)
      expect((await post(form.slug, { authorization: 'Bearer ffk_wrong' })).status).toBe(401)

      expect((await json(nobody.cookie, 'POST', `/api/forms/admin/forms/${form.id}/tokens`, { name: 'x' })).status).toBe(403)
      const created = await ok(await json(staff.cookie, 'POST', `/api/forms/admin/forms/${form.id}/tokens`, { name: 'Mobile' }))
      expect(created.token).toMatch(/^ffk_/)
      expect(created.prefix).toBe(created.token.slice(0, 8))

      expect((await post(form.slug, { authorization: `Bearer ${created.token}` })).status).toBe(200)
      expect((await post(form.slug, { 'x-form-token': created.token })).status).toBe(200)
      expect((await get(form.slug, { authorization: `Bearer ${created.token}` })).status).toBe(200)

      const listed = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/forms/${form.id}/tokens`)) as unknown as Json[]
      expect(listed).toHaveLength(1)
      expect(listed[0]).not.toHaveProperty('token')
      expect(listed[0]).not.toHaveProperty('tokenHash')
      expect(listed[0]!.lastUsedAt).toBeTypeOf('string')
      expect(JSON.stringify(listed)).not.toContain(created.token)

      for (const url of [`/api/forms/${form.slug}`, `/api/forms/${form.slug}/access`]) {
        const body = await (await fetch(url, { headers: { authorization: `Bearer ${created.token}` } })).text()
        expect(body).not.toContain(created.token)
        expect(body).not.toContain('tokenHash')
      }

      const revoked = await ok(await json(staff.cookie, 'DELETE', `/api/forms/admin/forms/${form.id}/tokens/${created.id}`))
      expect(revoked.revokedAt).toBeTypeOf('string')
      expect((await post(form.slug, { authorization: `Bearer ${created.token}` })).status).toBe(401)
      expect((await json(staff.cookie, 'DELETE', `/api/forms/admin/forms/${form.id}/tokens/nope`)).status).toBe(404)
    })

    it('token of another form is not accepted', async () => {
      const first = await create('Token A', withAccess({ availability: 'api', auth: 'token' }))
      const second = await create('Token B', withAccess({ availability: 'api', auth: 'token' }))
      const { token } = await ok(await json(staff.cookie, 'POST', `/api/forms/admin/forms/${first.id}/tokens`, { name: 'A' }))
      expect((await post(first.slug, { authorization: `Bearer ${token}` })).status).toBe(200)
      expect((await post(second.slug, { authorization: `Bearer ${token}` })).status).toBe(401)
    })

    it('password: closed until set, wrong 401, right 200, hash never returned, clearing closes again', async () => {
      const form = await create('Password form', withAccess({ availability: 'web', auth: 'password' }))
      const passwordUrl = `/api/forms/admin/forms/${form.id}/password`
      expect((await post(form.slug, { 'x-form-password': 'anything' })).status).toBe(401)
      expect(await ok(await json(staff.cookie, 'GET', passwordUrl))).toEqual({ set: false })
      expect((await json(staff.cookie, 'PUT', passwordUrl, { password: 'abc' })).status).toBe(400)

      const saved = await ok(await json(staff.cookie, 'PUT', passwordUrl, { password: 'open-sesame' }))
      expect(saved).toEqual({ set: true })
      expect(await ok(await json(staff.cookie, 'GET', passwordUrl))).toEqual({ set: true })
      const adminForm = JSON.stringify(await ok(await json(staff.cookie, 'GET', `/api/forms/admin/forms/${form.id}`)))
      expect(adminForm).not.toContain('open-sesame')
      expect(adminForm).not.toContain('passwordHash')

      expect((await post(form.slug)).status).toBe(401)
      expect((await post(form.slug, { 'x-form-password': 'wrong' })).status).toBe(401)
      expect((await get(form.slug, { 'x-form-password': 'wrong' })).status).toBe(401)
      expect((await post(form.slug, { 'x-form-password': 'open-sesame' })).status).toBe(200)
      const definition = await ok(await get(form.slug, { 'x-form-password': 'open-sesame' }))
      expect(JSON.stringify(definition)).not.toContain('open-sesame')

      const html = await $fetch<string>(`/forms/${form.slug}`)
      expect(html).toContain('This form is protected')

      expect(await ok(await json(staff.cookie, 'DELETE', passwordUrl))).toEqual({ set: false })
      expect((await post(form.slug, { 'x-form-password': 'open-sesame' })).status).toBe(401)
    })
  })

  describe('captcha', () => {
    const captchaForm = (provider: 'turnstile' | 'recaptcha' | 'hcaptcha' = 'turnstile', access?: FormDefinition['access']): FormDefinition => ({
      mode: 'single',
      storage: 'db',
      ...(access ? { access } : {}),
      steps: [{ id: 'main', fields: [
        { key: 'message', type: 'text', required: true },
        { key: 'human', type: 'captcha', captcha: { provider } },
      ] }],
    })
    const send = (formSlug: string, answers: Json, extra: Record<string, string> = {}) =>
      fetch(`/api/forms/${formSlug}/submit`, { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify({ answers, locale: 'en' }) })

    it('accepts a valid token without storing or delivering it', async () => {
      await $fetch('/api/test/captured?reset=1')
      const form = await create('Captcha ok', captchaForm())
      const response = await send(form.slug, { message: 'hi', human: 'good-token' })
      const result = await ok(response)
      expect(JSON.stringify(result)).not.toContain('good-token')

      const stored = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/submissions/${result.id}`))
      expect(stored.answers).toEqual({ message: 'hi' })
      expect(JSON.stringify(stored)).not.toContain('good-token')
      const captured = await $fetch<Json[]>('/api/test/captured')
      expect(captured.find(entry => entry.slug === form.slug)?.answers).toEqual({ message: 'hi' })
    })

    it('rejects an invalid token with an issue on the captcha field and stores nothing', async () => {
      const form = await create('Captcha bad', captchaForm('recaptcha'))
      const before = (await counts()).submissions
      const response = await send(form.slug, { message: 'hi', human: 'bad-token' })
      expect(response.status).toBe(422)
      const { data } = await response.json() as Json
      expect(data.issues).toEqual([{ path: ['human'], message: expect.any(String) }])
      expect((await counts()).submissions).toBe(before)
    })

    it('requires a token', async () => {
      const form = await create('Captcha missing', captchaForm())
      const response = await send(form.slug, { message: 'hi' })
      expect(response.status).toBe(422)
      expect(((await response.json()) as Json).data.issues.map((issue: Json) => issue.path[0])).toEqual(['human'])
      expect((await send(form.slug, { message: 'hi', human: '' })).status).toBe(422)
    })

    it('passes the provider to the verification hook', async () => {
      const form = await create('Captcha provider', captchaForm('hcaptcha'))
      expect((await send(form.slug, { message: 'hi', human: 'good-token' })).status).toBe(422)
      expect((await send(form.slug, { message: 'hi', human: 'good-hcaptcha' })).status).toBe(200)
    })

    it('fails closed when the provider has no secret key', async () => {
      const form = await create('Captcha unconfigured', captchaForm())
      const before = (await counts()).submissions
      const response = await send(form.slug, { message: 'hi', human: 'real-looking-token' })
      expect(response.status).toBe(500)
      expect(await response.text()).toContain('not configured')
      expect((await counts()).submissions).toBe(before)
    })

    it('is skipped for submissions with a valid API token', async () => {
      const form = await create('Captcha token', captchaForm('turnstile', { availability: 'api', auth: 'token' }))
      const { token } = await ok(await json(staff.cookie, 'POST', `/api/forms/admin/forms/${form.id}/tokens`, { name: 'bot' }))
      expect((await send(form.slug, { message: 'hi' })).status).toBe(401)
      const response = await send(form.slug, { message: 'hi', human: 'bad-token' }, { authorization: `Bearer ${token}` })
      expect(response.status, await response.clone().text()).toBe(200)
      const stored = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/submissions/${(await response.json() as Json).id}`))
      expect(stored.answers).toEqual({ message: 'hi' })
    })

    it('does not require a captcha hidden by a condition', async () => {
      const form = await create('Captcha hidden', { mode: 'single', storage: 'db', steps: [{ id: 'main', fields: [
        { key: 'kind', type: 'radio', options: [{ value: 'bot', label: 'Bot' }, { value: 'human', label: 'Human' }] },
        { key: 'human', type: 'captcha', showIf: { field: 'kind', op: 'eq', value: 'human' } },
      ] }] })
      expect((await send(form.slug, { kind: 'bot' })).status).toBe(200)
      expect((await send(form.slug, { kind: 'human' })).status).toBe(422)
      expect((await send(form.slug, { kind: 'human', human: 'good-token' })).status).toBe(200)
    })

    describe('secrets', () => {
      const secretsUrl = (id: string) => `/api/forms/admin/forms/${id}/secrets`
      const put = (id: string, key: string, value: string) => json(staff.cookie, 'PUT', secretsUrl(id), { key, value })
      const stored = () => $fetch<{ formId: string, secrets: string }[]>('/api/test/secrets')

      it('is staff only', async () => {
        const form = await create('Secrets gate', captchaForm())
        expect((await json(undefined, 'GET', secretsUrl(form.id))).status).toBe(401)
        expect((await json(nobody.cookie, 'GET', secretsUrl(form.id))).status).toBe(403)
        expect((await json(nobody.cookie, 'PUT', secretsUrl(form.id), { key: 'captcha.turnstile.secretKey', value: 'x' })).status).toBe(403)
        expect((await json(nobody.cookie, 'DELETE', `${secretsUrl(form.id)}/captcha.turnstile.secretKey`)).status).toBe(403)
      })

      it('stores a secret write-only: names and sources come back, never values', async () => {
        const form = await create('Secrets roundtrip', captchaForm('turnstile'))
        expect(await ok(await json(staff.cookie, 'GET', secretsUrl(form.id)))).toEqual({
          keys: [],
          captcha: { turnstile: { source: 'unset' }, recaptcha: { source: 'env' }, hcaptcha: { source: 'unset' } },
          unreadable: false,
        })

        const saved = await put(form.id, 'captcha.turnstile.secretKey', 'plain-turnstile-secret')
        const body = await saved.text()
        expect(saved.status, body).toBe(200)
        expect(body).not.toContain('plain-turnstile-secret')
        expect(JSON.parse(body)).toMatchObject({ keys: ['captcha.turnstile.secretKey'], captcha: { turnstile: { source: 'form' } } })

        const listed = await (await json(staff.cookie, 'GET', secretsUrl(form.id))).text()
        expect(listed).not.toContain('plain-turnstile-secret')
        const admin = await (await json(staff.cookie, 'GET', `/api/forms/admin/forms/${form.id}`)).text()
        expect(admin).not.toContain('plain-turnstile-secret')
        expect(await (await fetch(`/api/forms/${form.slug}`)).text()).not.toContain('plain-turnstile-secret')

        const removed = await ok(await json(staff.cookie, 'DELETE', `${secretsUrl(form.id)}/captcha.turnstile.secretKey`))
        expect(removed).toMatchObject({ keys: [], captcha: { turnstile: { source: 'unset' } } })
        expect((await stored()).find(row => row.formId === form.id)).toBeUndefined()
      })

      it('rejects keys outside the allowlist and empty values', async () => {
        const form = await create('Secrets allowlist', captchaForm())
        expect((await put(form.id, 'something.else', 'x')).status).toBe(400)
        expect((await put(form.id, 'captcha.turnstile.secretKey', '   ')).status).toBe(400)
        expect((await json(staff.cookie, 'DELETE', `${secretsUrl(form.id)}/something.else`)).status).toBe(400)
        expect((await put('frm_missing', 'captcha.turnstile.secretKey', 'x')).status).toBe(404)
      })

      it('encrypts the stored value', async () => {
        const form = await create('Secrets cipher', captchaForm('hcaptcha'))
        expect((await put(form.id, 'captcha.hcaptcha.secretKey', 'plaintext-hcaptcha-secret')).status).toBe(200)
        const rows = await stored()
        const row = rows.find(entry => entry.formId === form.id)
        expect(row, JSON.stringify(rows)).toBeDefined()
        expect(row!.secrets).not.toContain('plaintext-hcaptcha-secret')
        expect(row!.secrets).not.toContain('captcha.hcaptcha')
        expect(Object.keys(JSON.parse(row!.secrets)).sort()).toEqual(['ct', 'iv', 'tag'])
        // Replacing the secret re-encrypts with a new IV.
        expect((await put(form.id, 'captcha.hcaptcha.secretKey', 'plaintext-hcaptcha-secret')).status).toBe(200)
        const again = (await stored()).find(entry => entry.formId === form.id)!
        expect(JSON.parse(again.secrets).iv).not.toBe(JSON.parse(row!.secrets).iv)
      })

      it('verifies with the form secret over the environment one', async () => {
        const form = await create('Secrets precedence', captchaForm('recaptcha'))
        const send = (token: string) => submit(form.slug, { message: 'hi', human: token })
        // No form secret: the environment key is used.
        expect((await send('secret:env-recaptcha-secret')).status).toBe(200)
        expect((await send('secret:form-recaptcha-secret')).status).toBe(422)

        expect((await put(form.id, 'captcha.recaptcha.secretKey', 'form-recaptcha-secret')).status).toBe(200)
        expect((await send('secret:form-recaptcha-secret')).status).toBe(200)
        expect((await send('secret:env-recaptcha-secret')).status).toBe(422)
        expect(await ok(await json(staff.cookie, 'GET', secretsUrl(form.id)))).toMatchObject({ captcha: { recaptcha: { source: 'form' } } })

        // Another form keeps using the environment key.
        const other = await create('Secrets other', captchaForm('recaptcha'))
        expect((await submit(other.slug, { message: 'hi', human: 'secret:env-recaptcha-secret' })).status).toBe(200)

        await ok(await json(staff.cookie, 'DELETE', `${secretsUrl(form.id)}/captcha.recaptcha.secretKey`))
        expect((await send('secret:env-recaptcha-secret')).status).toBe(200)
      })

      it('fails closed with a form secret for another provider only', async () => {
        const form = await create('Secrets provider', captchaForm('turnstile'))
        expect((await put(form.id, 'captcha.hcaptcha.secretKey', 'hc-secret')).status).toBe(200)
        // The hook sees no secret for turnstile; a token it leaves alone falls through to the built-in check, which fails closed.
        expect((await submit(form.slug, { message: 'hi', human: 'secret:hc-secret' })).status).toBe(422)
        expect((await submit(form.slug, { message: 'hi', human: 'real-looking-token' })).status).toBe(500)
      })
    })

    it('rejects a condition on a captcha field in the definition', async () => {
      const bad = await json(staff.cookie, 'POST', '/api/forms/admin/forms', { slug: slug('captcha-cond'), name: 'Bad', definition: { mode: 'single', storage: 'db', steps: [{ id: 'main', fields: [
        { key: 'human', type: 'captcha' },
        { key: 'after', type: 'text', showIf: { field: 'human', op: 'notEmpty' } },
      ] }] } })
      expect(bad.status).toBe(400)
    })
  })

  describe('delivery', () => {
    const single = (storage: 'db' | 'none'): FormDefinition => ({
      mode: 'single',
      storage,
      steps: [{ id: 'main', fields: [{ key: 'message', type: 'textarea', required: true }] }],
    })

    it('emits forms:submitted and records delivery failures without failing a stored submission', async () => {
      await $fetch('/api/test/captured?reset=1')
      const form = await create('Failing', single('db'))
      const failing = await ok(await json(staff.cookie, 'PATCH', `/api/forms/admin/forms/${form.id}`, { slug: slug('failing') }))

      const { id } = await ok(await submit(failing.slug, { message: 'hi' }))
      const detail = await ok(await json(staff.cookie, 'GET', `/api/forms/admin/submissions/${id}`))
      expect(detail.deliveryStatus).toBe('failed')
      expect(detail.deliveryError).toBe('listener failed')

      const captured = await $fetch<Json[]>('/api/test/captured')
      expect(captured).toEqual([expect.objectContaining({ slug: failing.slug, submissionId: id, stored: true })])
    })

    it('emails a custom body with variables replaced and every value escaped', async () => {
      await $fetch('/api/test/mails?reset=1')
      const form = await create('Custom body', {
        mode: 'single',
        storage: 'db',
        steps: [{ id: 'main', fields: [
          { key: 'name', type: 'text', required: true, label: 'Name' },
          { key: 'kind', type: 'select', options: [{ value: 'a', label: { en: 'Alpha', da: 'Alfa' } }] },
          { key: 'message', type: 'textarea' },
        ] }],
        delivery: { email: {
          to: ['owner@example.com'],
          subject: 'Hello {{ answer.name }} via {{form.name}}',
          body: { en: 'Form {{ form.name }} ({{form.slug}} v{{form.version}})\nId: {{submission.id}}\nKind: {{answer.kind}}\nMsg: {{answer.message}}\nNope: [{{nope}}]\n{{answers}}' },
        } },
      })

      const evil = '<script>alert(1)</script> {{form.name}}'
      const { id } = await ok(await submit(form.slug, { name: 'Eve\nBcc: x@example.com', kind: 'a', message: evil }))

      const mails = await $fetch<Json[]>('/api/test/mails')
      expect(mails).toHaveLength(1)
      const [mail] = mails as [Json]
      expect(mail.subject).toBe('Hello Eve Bcc: x@example.com via Custom body')
      expect(mail.text).toContain(`Form Custom body (${form.slug} v1)\nId: ${id}\nKind: Alpha\nMsg: ${evil}\nNope: []\n`)
      expect(mail.text).toContain(`Name: Eve\nBcc: x@example.com`)
      expect(mail.body).not.toContain('<script>')
      expect(mail.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt; {{form.name}}')
      expect(mail.body).toContain('<br>')
    })

    it('storage: none writes nothing, emits the hook and surfaces delivery errors', async () => {
      await $fetch('/api/test/captured?reset=1')
      const before = await counts()

      const form = await create('Mail only', single('none'))
      const response = await ok(await submit(form.slug, { message: 'hello' }))
      expect(response.id).toBeNull()
      expect(await counts()).toEqual(before)
      expect(await $fetch<Json[]>('/api/test/captured')).toEqual([
        expect.objectContaining({ slug: form.slug, submissionId: null, stored: false, answers: { message: 'hello' } }),
      ])
      expect((await submit(form.slug, {})).status).toBe(422)

      const failing = await ok(await json(staff.cookie, 'POST', '/api/forms/admin/forms', {
        slug: slug('failing-none'), name: 'Failing none', status: 'published', definition: single('none'),
      }))
      expect((await submit(failing.slug, { message: 'hello' })).status).toBe(502)
      expect(await counts()).toEqual(before)
    })
  })

  describe('import', () => {
    it('inserts new slugs and skips existing ones, never overwriting', async () => {
      const entry = (name: string) => ({ slug: 'imported-form', name, definition: { mode: 'single', steps: [{ id: 's', fields: [] }] } })
      const first = await ok(await json(staff.cookie, 'POST', '/api/forms/admin/import', { forms: [entry('First')] }))
      expect(first).toEqual({ inserted: ['imported-form'], skipped: [] })
      const second = await ok(await json(staff.cookie, 'POST', '/api/forms/admin/import', { forms: [entry('Second')] }))
      expect(second).toEqual({ inserted: [], skipped: ['imported-form'] })

      const list = await ok(await json(staff.cookie, 'GET', '/api/forms/admin/forms')) as unknown as Json[]
      expect(list.find(form => form.slug === 'imported-form')?.name).toBe('First')
      expect(list.find(form => form.slug === 'imported-form')?.status).toBe('draft')
    })
  })

  describe('API tokens', () => {
    const createToken = async (cookie: string, scopes: string[]) => {
      const response = await fetch('/api/auth/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'test', scopes }),
      })
      expect(response.status, await response.clone().text()).toBe(200)
      return (await response.json() as { token: string }).token
    }
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

    it('lets a staff token manage forms only with the scope, and the policy still decides', async () => {
      const manage = await createToken(staff.cookie, ['forms:manage'])
      expect((await fetch('/api/forms/admin/forms', { headers: bearer(manage) })).status).toBe(200)
      expect((await fetch('/api/forms/admin/forms', { headers: bearer(await createToken(staff.cookie, ['forms:submit'])) })).status).toBe(403)
      // Staff scopes are not even offered to, or accepted from, users the policy keeps out.
      expect(await scopesFor(nobody.cookie)).not.toContain('forms:manage')
      expect(await scopesFor(nobody.cookie)).toContain('forms:submit')
      expect(await scopesFor(staff.cookie)).toEqual(expect.arrayContaining(['forms:manage', 'forms:pii']))
      expect(await tokenStatus(nobody.cookie, ['forms:manage'])).toBe(400)
    })

    it('does not mistake per-form tokens for credentials', async () => {
      // `ffk_` tokens are claimed by nobody here, so a signed-in session keeps working next to one.
      expect((await fetch('/api/forms/admin/forms', { headers: { cookie: staff.cookie, authorization: 'Bearer ffk_form-token' } })).status).toBe(200)
    })
  })

  describe('MCP tools', () => {
    it('scopes, gates and redacts', async () => {
      const staff = await registerUser('McpStaff', 'mcp-staff@staff.test')
      const guest = await registerUser('Guest', 'mcp-guest@example.com')

      expect(await tokenStatus(guest.cookie, ['forms:manage'])).toBe(400)
      const guestAll = await mcpToken(guest.cookie, ['forms:submit'])
      expect(await mcpNames(guestAll)).toEqual(['get-form', 'list-forms', 'submit-form'])

      expect(await mcpNames(await mcpToken(staff.cookie, ['*']))).toContain('list-all-forms')

      const staffManage = await mcpToken(staff.cookie, ['forms:manage'])
      expect(await mcpNames(staffManage)).toEqual(['create-form', 'get-form-definition', 'get-submission', 'list-all-forms', 'list-submissions', 'update-form'])

      // Delivery settings cannot be set (or read) through MCP.
      const refused = await mcpCall(staffManage, 'create-form', { slug: 'sneaky', name: 'Sneaky', definition: { ...definition, delivery: { email: { to: 'attacker@example.com' } } } })
      expect(refused.result?.isError).toBe(true)

      const created = await mcpCall(staffManage, 'create-form', { slug: 'survey', name: 'Survey', status: 'published', definition })
      expect(created.result?.isError, mcpText(created)).toBeFalsy()
      const formId = created.result!.structuredContent?.id ?? JSON.parse(created.result!.content[0].text).id

      // Submit as the caller, who is the submitter of record.
      const guestSubmit = await mcpToken(guest.cookie, ['forms:submit'])
      const submitted = await mcpCall(guestSubmit, 'submit-form', { slug: 'survey', answers: { secret: 'my private answer' } })
      expect(submitted.result?.isError, mcpText(submitted)).toBeFalsy()

      // Without forms:pii a manager sees metadata only.
      const redactedList = await mcpCall(staffManage, 'list-submissions', { formId })
      expect(mcpText(redactedList)).not.toContain('my private answer')
      const submissionId = JSON.parse(redactedList.result!.content[0].text).submissions[0].id
      const redacted = await mcpCall(staffManage, 'get-submission', { id: submissionId })
      expect(redacted.result?.isError, mcpText(redacted)).toBeFalsy()
      expect(mcpText(redacted)).not.toContain('my private answer')
      expect(mcpText(redacted)).toContain('forms:pii')
      expect(mcpText(refused)).toContain('exfiltrate')

      const staffPii = await mcpToken(staff.cookie, ['forms:manage', 'forms:pii'])
      expect(mcpText(await mcpCall(staffPii, 'get-submission', { id: submissionId }))).toContain('my private answer')

      // A non-staff caller cannot reach the manager tools even with the scopes.
      expect((await mcpCall(guestAll, 'list-all-forms')).result?.isError).toBe(true)
    })
  })
})
