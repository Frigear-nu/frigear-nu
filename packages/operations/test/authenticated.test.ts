import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError, fixtureSqlite, reindexOf, runSearchReindex } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { operationsApi } from '../src/runtime/utils/api'
import { operationsAccess } from '../src/runtime/access'
import { evaluateGrants, getHooksFor, getStatusChanges, participate, registerUser, validateGrants } from './helpers'

type Session = Awaited<ReturnType<typeof registerUser>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

// The raw response of one call as `cookie` (or anonymously), whatever its status.
const json = (cookie: string | undefined, method: ApiMethod, path: string, body?: unknown) => apiClient({ cookie }).fetch(method, path, body)
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.json() as Promise<Json>
}

/** The first bytes of a PNG of `width` by `height`: what the underlay upload reads its type and size from. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
let counter = 0

async function createToken(cookie: string, scopes: string[]) {
  return (await ok(await json(cookie, 'POST', authApi.me.tokens, { name: 'test', scopes }))).token as string
}

describe('operations (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: Session
  const user = async (name: string) => registerUser(name, `${name.toLowerCase()}${++counter}@example.com`)

  async function createOperation(overrides: Json = {}): Promise<Json> {
    staff ??= await registerUser('Staff', 'staff@staff.test')
    return ok(await json(staff.cookie, 'POST', operationsApi.admin.operations, {
      slug: `operation-${++counter}`,
      name: { en: 'Summer Festival 2030 bar operation', da: 'Summer Festival 2030 baroperation' },
      startsAt: future(30),
      endsAt: future(37),
      ...overrides,
    }))
  }

  const setStatus = (id: string, status: string) => json(staff.cookie, 'POST', operationsApi.admin.status(id), { status })

  describe('access', () => {
    it('denies the admin API by default: anonymous 401, non-staff 403', async () => {
      const nobody = await user('Nobody')
      expect((await json(undefined, 'GET', operationsApi.admin.operations)).status).toBe(401)
      expect((await json(undefined, 'POST', operationsApi.admin.operations, {})).status).toBe(401)
      await expectApiError(json(nobody.cookie, 'GET', operationsApi.admin.operations), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', operationsApi.admin.operations, { slug: 'x', name: 'X', startsAt: future(1) }), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'GET', operationsApi.admin.operation('opr_missing')), 403, 'forbidden')
    })

    it('answers 401 before 404 on the admin API', async () => {
      expect((await json(undefined, 'GET', operationsApi.admin.operation('opr_missing'))).status).toBe(401)
      expect((await json(undefined, 'PATCH', operationsApi.admin.operation('opr_missing'), {})).status).toBe(401)
      expect((await json(undefined, 'DELETE', operationsApi.admin.operation('opr_missing'))).status).toBe(401)
      expect((await json(undefined, 'POST', operationsApi.admin.status('opr_missing'), { status: 'active' })).status).toBe(401)
    })

    it('lets a staff token manage with the permission, and refuses one without (insufficient_scope)', async () => {
      staff ??= await registerUser('Staff', 'staff@staff.test')
      const manage = operationsAccess.permissions.manage
      const withManage = apiClient({ bearer: await createToken(staff.cookie, [manage]) })
      const created = await withManage.json<Json>('POST', operationsApi.admin.operations, { slug: `token-${++counter}`, name: 'By token', startsAt: future(2) })
      expect(created.status).toBe('planning')
      expect(await withManage.json<Json>('GET', operationsApi.admin.operation(created.id))).toMatchObject({ id: created.id })

      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [operationsAccess.permissions.read]) })
      await expectApiError(readOnly.json('GET', operationsApi.admin.operations), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', operationsApi.admin.operations, { slug: `nope-${++counter}`, name: 'No', startsAt: future(2) }), 403, 'insufficient_scope')
    })

    it('refuses a read-only token on PATCH, DELETE and the status route (insufficient_scope)', async () => {
      const operation = await createOperation()
      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [operationsAccess.permissions.read]) })
      await expectApiError(readOnly.json('PATCH', operationsApi.admin.operation(operation.id), { name: 'Nope' }), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('DELETE', operationsApi.admin.operation(operation.id)), 403, 'insufficient_scope')
      await expectApiError(readOnly.json('POST', operationsApi.admin.status(operation.id), { status: 'active' }), 403, 'insufficient_scope')
      expect(await ok(await json(staff.cookie, 'GET', operationsApi.admin.operation(operation.id)))).toMatchObject({ status: 'planning' })
    })

    it('lets a role holding operations:* manage operations (the wildcard covers non-sensitive permissions)', async () => {
      const wild = await registerUser('Wild', `wild${++counter}@wild.test`)
      expect((await json(wild.cookie, 'GET', operationsApi.admin.operations)).status).toBe(200)
    })
  })

  describe('admin CRUD', () => {
    it('creates, reads, edits and deletes an operation as a coordinator', async () => {
      const created = await createOperation({
        public: true,
        hostName: 'Summer Festival',
        hostUrl: 'https://example.com/summer',
        location: { name: { en: 'Main Street', da: 'Main Street' }, address: 'Main Street 1, Example Town', point: { lat: 10.0, lng: 20.0 }, radiusMeters: 250 },
        schedule: { type: 'always' },
      })
      expect(created).toMatchObject({
        status: 'planning',
        public: true,
        hostName: 'Summer Festival',
        location: { address: 'Main Street 1, Example Town', point: { lat: 10.0, lng: 20.0 }, radiusMeters: 250 },
        schedule: { type: 'always' },
        eventId: null,
      })
      expect(created.id).toMatch(/^opr_/)
      expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false)

      expect(await ok(await json(staff.cookie, 'GET', operationsApi.admin.operation(created.id)))).toMatchObject({ slug: created.slug })

      const patched = await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(created.id), { name: 'Renamed', hostName: '', public: false }))
      expect(patched).toMatchObject({ name: 'Renamed', hostName: null, public: false, slug: created.slug })

      const response = await json(staff.cookie, 'DELETE', operationsApi.admin.operation(created.id))
      expect(response.status).toBe(204)
      await expectApiError(json(staff.cookie, 'GET', operationsApi.admin.operation(created.id)), 404, 'not_found')
    })

    it('lists with paging, a status filter and a search over every language and the slug', async () => {
      const marker = `lst${++counter}`
      const a = await createOperation({ slug: `${marker}-alpha`, name: { en: `Alpha ${marker}`, da: `Alfa ${marker}` } })
      const b = await createOperation({ slug: `${marker}-beta`, name: `Beta ${marker}` })
      await ok(await setStatus(b.id, 'active'))

      const search = await ok(await json(staff.cookie, 'GET', `${operationsApi.admin.operations}?q=${marker}&sort=slug&order=asc`))
      expect(search.total).toBe(2)
      expect(search.items.map((item: Json) => item.id)).toEqual([a.id, b.id])

      const danish = await ok(await json(staff.cookie, 'GET', `${operationsApi.admin.operations}?q=alfa ${marker}`))
      expect(danish.items.map((item: Json) => item.id)).toEqual([a.id])

      const active = await ok(await json(staff.cookie, 'GET', `${operationsApi.admin.operations}?q=${marker}&status=active`))
      expect(active.items.map((item: Json) => item.id)).toEqual([b.id])

      const paged = await ok(await json(staff.cookie, 'GET', `${operationsApi.admin.operations}?q=${marker}&pageSize=1&page=2&sort=slug&order=asc`))
      expect(paged).toMatchObject({ total: 2, page: 2, pageSize: 1 })
      expect(paged.items.map((item: Json) => item.id)).toEqual([b.id])
    })

    it('searches Danish letters regardless of the case typed', async () => {
      const marker = `dk${++counter}`
      const bar = await createOperation({ slug: `${marker}-bar`, name: { da: `ølbar ${marker}`, en: `Beer bar ${marker}` } })
      const found = async (q: string) => ((await ok(await json(staff.cookie, 'GET', `${operationsApi.admin.operations}?q=${encodeURIComponent(q)}`))).items as Json[]).map(item => item.id)
      expect(await found(`ølbar ${marker}`)).toEqual([bar.id])
      // sqlite folds ASCII only: the typed capitals are lowercased before they reach the query.
      expect(await found(`ØLBAR ${marker}`)).toEqual([bar.id])
      expect(await found(`Ølbar ${marker}`)).toEqual([bar.id])
      expect(await found(`BEER BAR ${marker}`)).toEqual([bar.id])
    })

    it('finds stored names that start with a Danish capital', async () => {
      const marker = `dkc${++counter}`
      const found = async (q: string) => ((await ok(await json(staff.cookie, 'GET', `${operationsApi.admin.operations}?q=${encodeURIComponent(q)}`))).items as Json[]).map(item => item.id)
      const ol = await createOperation({ slug: `${marker}-ol`, name: { da: `Ølfestival ${marker}` } })
      const aeble = await createOperation({ slug: `${marker}-aeble`, name: `Æblefest ${marker}` })
      const aarhus = await createOperation({ slug: `${marker}-aarhus`, name: { da: `Bar i Århus ${marker}`, en: `Bar in Aarhus ${marker}` } })
      // As stored, lowercase, all capitals.
      expect(await found(`Ølfestival ${marker}`)).toEqual([ol.id])
      expect(await found(`ølfestival ${marker}`)).toEqual([ol.id])
      expect(await found(`ØLFESTIVAL ${marker}`)).toEqual([ol.id])
      expect(await found(`Æblefest ${marker}`)).toEqual([aeble.id])
      expect(await found(`æblefest ${marker}`)).toEqual([aeble.id])
      // A capital inside the name.
      expect(await found(`århus ${marker}`)).toEqual([aarhus.id])
      expect(await found(`Århus ${marker}`)).toEqual([aarhus.id])
      // Capitals in the middle of a word, and names stored in capitals (operations.searchText is folded on write).
      const caps = await createOperation({ slug: `${marker}-caps`, name: { da: `STORE ØLBAR ÆBLEGÅRD ${marker}` } })
      expect(await found(`ølbar æblegård ${marker}`)).toEqual([caps.id])
      expect(await found(`æblegård ${marker}`)).toEqual([caps.id])
      expect(await found(`ÆbleGÅRD ${marker}`)).toEqual([caps.id])
      expect(await found(`${marker}-caps`)).toEqual([caps.id])
      // A rename or a new slug is searchable at once, the old name no longer.
      expect((await json(staff.cookie, 'PATCH', operationsApi.admin.operation(caps.id), { name: { da: `Åkande ${marker}` }, slug: `${marker}-akande` })).status).toBe(200)
      expect(await found(`ÅKANDE ${marker}`)).toEqual([caps.id])
      expect(await found(`${marker}-akande`)).toEqual([caps.id])
      expect(await found(`ølbar æblegård ${marker}`)).toEqual([])
    })

    it('search:reindex refolds operations.searchText left by the ASCII-only SQL backfill, and a second run changes nothing', async () => {
      const marker = `rx${++counter}`
      const found = async (q: string) => ((await ok(await json(staff.cookie, 'GET', `${operationsApi.admin.operations}?q=${encodeURIComponent(q)}`))).items as Json[]).map(item => item.id)
      const op = await createOperation({ slug: `${marker}-op`, name: { da: `ØLBAR ÆBLEGÅRD ${marker}`, en: `Beer ${marker}` } })
      const sqlite = fixtureSqlite(`${dataDir}/db/sqlite.db`)
      // The backfill of the migration that added the column: sqlite's lower() keeps Æ, Ø and Å.
      sqlite.exec('update operations set searchText = lower(coalesce((select group_concat(value, char(10)) from json_each(operations.name)), \'\') || char(10) || slug) where id = ?', op.id)
      expect(await found(`ølbar ${marker}`)).toEqual([])

      const first = reindexOf(await runSearchReindex(), 'operations')!
      expect(first.updated).toBeGreaterThanOrEqual(1)
      expect(sqlite.query<{ searchText: string }>('select searchText from operations where id = ?', op.id)[0]!.searchText)
        .toBe(`ølbar æblegård ${marker}\nbeer ${marker}\n${marker}-op`)
      expect(await found(`ølbar æblegård ${marker}`)).toEqual([op.id])

      expect(reindexOf(await runSearchReindex(), 'operations')).toEqual({ ...first, updated: 0 })
    })

    it('validates the body', async () => {
      staff ??= await registerUser('Staff', 'staff@staff.test')
      const base = { name: 'Valid', startsAt: future(3) }
      for (const body of [
        { ...base, slug: 'Not Valid' },
        { ...base, slug: 'me' },
        { ...base, slug: 'new' },
        { ...base, slug: 'ok-slug', hostUrl: 'javascript:alert(1)' },
        { ...base, slug: 'ok-slug', startsAt: future(5), endsAt: future(2) },
        { ...base, slug: 'ok-slug', name: {} },
        { slug: 'ok-slug', startsAt: future(3) },
      ]) {
        expect((await json(staff.cookie, 'POST', operationsApi.admin.operations, body)).status, JSON.stringify(body)).toBe(400)
      }
    })

    it('requires ISO datetimes with an offset, so the server time zone never shifts a date', async () => {
      staff ??= await registerUser('Staff', 'staff@staff.test')
      const body = { slug: `tz-${++counter}`, name: 'Zone' }
      // `datetime-local` strings carry no offset: refused, never read in the server's zone.
      expect((await json(staff.cookie, 'POST', operationsApi.admin.operations, { ...body, startsAt: '2027-06-27T10:00' })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', operationsApi.admin.operations, { ...body, startsAt: '2027-06-27' })).status).toBe(400)

      // An offset keeps the instant: 10:00 at +02:00 is 08:00Z.
      const created = await ok(await json(staff.cookie, 'POST', operationsApi.admin.operations, { ...body, startsAt: '2027-06-27T10:00:00+02:00', endsAt: '2027-07-04T10:00:00.000Z' }))
      expect(created.startsAt).toBe('2027-06-27T08:00:00.000Z')
      // Sending the returned values back (a save of an untouched form) changes nothing.
      const again = await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(created.id), { startsAt: created.startsAt, endsAt: created.endsAt }))
      expect(again).toMatchObject({ startsAt: created.startsAt, endsAt: created.endsAt })
    })

    it('rejects null, true and 0 as dates instead of reading them as 1970', async () => {
      const operation = await createOperation()
      for (const startsAt of [null, true, 0, '']) {
        expect((await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { startsAt })).status, String(startsAt)).toBe(400)
      }
      for (const endsAt of [true, 0, '']) {
        expect((await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { endsAt })).status, String(endsAt)).toBe(400)
      }
      // The end may be cleared.
      expect(await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { endsAt: null }))).toMatchObject({ endsAt: null })
      expect((await ok(await json(staff.cookie, 'GET', operationsApi.admin.operation(operation.id)))).startsAt).toBe(operation.startsAt)
    })

    it('refuses a patch that puts the end before the start', async () => {
      const created = await createOperation({ startsAt: future(10), endsAt: future(12) })
      expect((await json(staff.cookie, 'PATCH', operationsApi.admin.operation(created.id), { endsAt: future(1) })).status).toBe(400)
      expect((await json(staff.cookie, 'PATCH', operationsApi.admin.operation(created.id), { startsAt: future(20) })).status).toBe(400)
    })

    it('keeps slugs unique (409 conflict), also when renaming', async () => {
      const first = await createOperation()
      await expectApiError(json(staff.cookie, 'POST', operationsApi.admin.operations, { slug: first.slug, name: 'Twin', startsAt: future(3) }), 409, 'conflict')
      const second = await createOperation()
      await expectApiError(json(staff.cookie, 'PATCH', operationsApi.admin.operation(second.id), { slug: first.slug }), 409, 'conflict')
      // Keeping its own slug is fine.
      expect((await json(staff.cookie, 'PATCH', operationsApi.admin.operation(second.id), { slug: second.slug })).status).toBe(200)
    })

    it('accepts an eventId as it is while events is not installed', async () => {
      const created = await createOperation({ eventId: 'evn_unknown' })
      expect(created.eventId).toBe('evn_unknown')
    })
  })

  describe('location and venue layout', () => {
    const area = [{ lat: 10.02, lng: 20.07 }, { lat: 10.02, lng: 20.09 }, { lat: 10.01, lng: 20.08 }]
    const station = (id: string, properties: Json = {}) => ({ id, kind: 'operations.station', geometry: { type: 'Point', coordinates: [100, 200] }, properties })
    const upload = (cookie: string | undefined, operationId: string, bytes: Uint8Array, name = 'plan.png') => {
      const body = new FormData()
      body.append('file', new Blob([bytes as BlobPart], { type: 'image/png' }), name)
      return fetch(operationsApi.admin.venueUnderlay(operationId), { method: 'POST', body, headers: cookie ? { cookie } : {} })
    }

    it('stores the location picker\'s value, and refuses a radius or area without a point, or both', async () => {
      const operation = await createOperation({ location: { point: { lat: 10.015, lng: 20.08 }, area } })
      expect(operation.location).toEqual({ point: { lat: 10.015, lng: 20.08 }, area })
      for (const location of [
        { name: 'Bar', radiusMeters: 10 },
        { point: { lat: 10, lng: 20 }, radiusMeters: 10, area },
        { point: { lat: 95, lng: 12 } },
        { point: { lat: 10, lng: 20 }, area: area.slice(0, 2) },
        {},
      ]) {
        expect((await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { location })).status, JSON.stringify(location)).toBe(400)
      }
      const cleared = await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { location: null }))
      expect(cleared.location).toBeNull()
    })

    it('saves a venue layout of the allowed kinds, with properties their schemas accept', async () => {
      const operation = await createOperation({ public: true })
      expect(await ok(await json(staff.cookie, 'GET', operationsApi.admin.venueLayout(operation.id)))).toEqual({ type: 'FeatureCollection', features: [], extent: null, underlay: null, revision: expect.any(String), placement: null, placementRevision: expect.any(String) })

      const layout = {
        features: [
          station('bar-1', { taps: 8 }),
          { id: 'stage', kind: 'maps.area', label: { en: 'Stage', da: 'Scene' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 50]]] } },
          { id: 'cold-1', kind: 'operations.container', geometry: { type: 'Point', coordinates: [5, 5] } },
        ],
        extent: { width: 800, height: 600 },
      }
      const saved = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout }))
      expect(saved.features.map((feature: Json) => feature.id)).toEqual(['bar-1', 'stage', 'cold-1'])
      // Polygons are closed, and defaults filled in by the kind's schema.
      expect(saved.features[1].geometry.coordinates[0]).toHaveLength(4)
      expect(saved.features[2].properties).toEqual({ cooled: false })
      expect(saved.extent).toEqual({ width: 800, height: 600 })
      // Whoever may read the operation reads its layout; a public operation is everyone's.
      const { revision, placementRevision: _placementRevision, ...publicLayout } = saved
      expect(revision).toEqual(expect.any(String))
      expect(await ok(await json(undefined, 'GET', operationsApi.venueLayout(operation.slug)))).toEqual(publicLayout)

      const invalid = await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-1', { taps: -1 }), { ...station('seat'), kind: 'seating.seat' }, station('bar-1')] } })
      expect(invalid.status).toBe(400)
      const issues = JSON.stringify(await invalid.json())
      expect(issues).toContain('used twice')
      expect(issues).toContain('not allowed')
    })

    it('keeps the venue layout to staff with operations:manage, and to readers of the operation', async () => {
      const operation = await createOperation({ public: false })
      const plain = await user('Venueplain')
      const layout = { features: [station('bar-1')] }
      expect((await json(undefined, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout })).status).toBe(401)
      await expectApiError(json(plain.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout }), 403, 'forbidden')
      await expectApiError(json(plain.cookie, 'GET', operationsApi.admin.venueLayout(operation.id)), 403, 'forbidden')
      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [operationsAccess.permissions.read]) })
      await expectApiError(readOnly.json('PUT', operationsApi.admin.venueLayout(operation.id), { layout }), 403, 'insufficient_scope')
      // A private operation's layout is a 404 for those who do not take part, like the operation.
      expect((await json(plain.cookie, 'GET', operationsApi.venueLayout(operation.slug))).status).toBe(404)
      expect((await json(undefined, 'GET', operationsApi.venueLayout(operation.slug))).status).toBe(404)
      await participate(plain.cookie, operation.id)
      expect((await ok(await json(plain.cookie, 'GET', operationsApi.venueLayout(operation.slug)))).features).toEqual([])
    })

    it('uploads an underlay, serves it to readers, keeps it on save and removes it with underlay: null', async () => {
      const operation = await createOperation({ public: true })
      const anonymous = await upload(undefined, operation.id, pngBytes(40, 30))
      expect(anonymous.status).toBe(401)
      const refused = await upload(staff.cookie, operation.id, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'plan.svg')
      expect(refused.status).toBe(415)

      const response = await upload(staff.cookie, operation.id, pngBytes(40, 30))
      expect(response.status, await response.clone().text()).toBe(200)
      const underlay = await response.json() as Json
      expect(underlay).toMatchObject({ width: 40, height: 30, revision: expect.any(String) })
      expect(underlay.url).toMatch(new RegExp(`^/api/operations/${operation.slug}/venue-layout/underlay\\?v=`))
      expect(JSON.stringify(underlay)).not.toContain(`operations/${operation.id}`)
      const image = await fetch(underlay.url)
      expect(image.status).toBe(200)
      expect(image.headers.get('content-type')).toBe('image/png')
      expect(image.headers.get('x-content-type-options')).toBe('nosniff')

      // Saving the layout keeps the stored image, whatever underlay the client sends; an external image is refused.
      const external = await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-1')], underlay: { url: 'https://evil.example/x.png', width: 1, height: 1 } } })
      expect(external.status).toBe(400)
      expect(JSON.stringify(await external.json())).toContain('underlay')
      const saved = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-1')], underlay: { url: '/api/elsewhere.png', width: 1, height: 1 } } }))
      expect(saved.underlay).toEqual({ url: underlay.url, width: 40, height: 30 })
      const { revision: _revision, ...savedLayout } = saved
      const removed = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { ...savedLayout, underlay: null } }))
      expect(removed.underlay).toBeNull()
      expect(removed.features).toHaveLength(1)
      expect((await fetch(underlay.url)).status).toBe(404)
    })

    it('saves the placement apart from the layout, with its own revision, and serves it with the layout', async () => {
      const operation = await createOperation({ public: true })
      const read = await ok(await json(staff.cookie, 'GET', operationsApi.admin.venueLayout(operation.id)))
      expect(read.placement).toBeNull()
      const layout = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-1')] }, revision: read.revision }))

      const placement = { georeference: { origin: { lat: 10.5, lng: 20.25 }, rotation: 370, metersPerUnit: 0.05 }, underlayMode: 'tiles', underlayOpacity: 0.7, gridUnit: 'metres', gridSize: 0.5 }
      const saved = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venuePlacement(operation.id), { placement, revision: read.placementRevision }))
      const stored = { ...placement, georeference: { ...placement.georeference, rotation: 10 } }
      expect(saved).toEqual({ placement: stored, revision: expect.any(String) })
      expect(saved.revision).not.toBe(read.placementRevision)

      // The layout is untouched, and both come back together: to staff with both revisions, to readers without.
      const now = await ok(await json(staff.cookie, 'GET', operationsApi.admin.venueLayout(operation.id)))
      expect(now).toMatchObject({ revision: layout.revision, placement: stored, placementRevision: saved.revision })
      expect(now.features.map((feature: Json) => feature.id)).toEqual(['bar-1'])
      const publicLayout = await ok(await json(undefined, 'GET', operationsApi.venueLayout(operation.slug)))
      expect(publicLayout.placement).toEqual(stored)
      expect(publicLayout.placementRevision).toBeUndefined()

      // A layout save does not need the placement's revision, and does not move it.
      await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-2')] }, revision: layout.revision }))
      expect((await ok(await json(staff.cookie, 'GET', operationsApi.admin.venueLayout(operation.id)))).placementRevision).toBe(saved.revision)

      // A placement someone moved since it was read is not overwritten.
      await expectApiError(json(staff.cookie, 'PUT', operationsApi.admin.venuePlacement(operation.id), { placement: { ...placement, underlayMode: 'none' }, revision: read.placementRevision }), 409, 'venue_placement_changed')

      // Tiles or a metre grid need the georeference; the scale must be positive.
      for (const invalid of [{ underlayMode: 'tiles' }, { gridUnit: 'metres' }, { georeference: { ...placement.georeference, metersPerUnit: 0 } }, { underlayOpacity: 3 }]) {
        expect((await json(staff.cookie, 'PUT', operationsApi.admin.venuePlacement(operation.id), { placement: invalid })).status, JSON.stringify(invalid)).toBe(400)
      }

      // `null` removes it.
      const removed = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venuePlacement(operation.id), { placement: null, revision: saved.revision }))
      expect(removed.placement).toBeNull()
      expect((await ok(await json(undefined, 'GET', operationsApi.venueLayout(operation.slug)))).placement).toBeNull()
    })

    it('keeps the placement to staff with operations:manage', async () => {
      const operation = await createOperation({ public: true })
      const plain = await user('Placementplain')
      const placement = { georeference: { origin: { lat: 1, lng: 2 }, rotation: 0, metersPerUnit: 1 } }
      expect((await json(undefined, 'PUT', operationsApi.admin.venuePlacement(operation.id), { placement })).status).toBe(401)
      await expectApiError(json(plain.cookie, 'PUT', operationsApi.admin.venuePlacement(operation.id), { placement }), 403, 'forbidden')
      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [operationsAccess.permissions.read]) })
      await expectApiError(readOnly.json('PUT', operationsApi.admin.venuePlacement(operation.id), { placement }), 403, 'insufficient_scope')
      const manager = apiClient({ bearer: await createToken(staff.cookie, [operationsAccess.permissions.manage]) })
      expect((await manager.json<Json>('PUT', operationsApi.admin.venuePlacement(operation.id), { placement })).placement).toMatchObject(placement)
    })

    it('saves a layout drawn on the map in real coordinates', async () => {
      const operation = await createOperation({ public: true })
      const layout = { crs: 'geo', features: [{ id: 'gate', kind: 'maps.marker', geometry: { type: 'Point', coordinates: [20.25, 10.5] } }] }
      const saved = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout }))
      expect(saved.crs).toBe('geo')
      expect(saved.features[0].geometry.coordinates).toEqual([20.25, 10.5])
      expect((await ok(await json(undefined, 'GET', operationsApi.venueLayout(operation.slug)))).crs).toBe('geo')
      expect((await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { ...layout, features: [{ ...layout.features[0], geometry: { type: 'Point', coordinates: [500, 10] } }] } })).status).toBe(400)
    })

    it('refuses a save or an upload when the layout changed since the client read it (409), and keeps both changes apart', async () => {
      const operation = await createOperation({ public: true })
      const read = await ok(await json(staff.cookie, 'GET', operationsApi.admin.venueLayout(operation.id)))
      // A second editor saves first, with the revision both read.
      const first = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-1')] }, revision: read.revision }))
      expect(first.revision).not.toBe(read.revision)

      // The first editor's save and upload, still on the old revision, are refused and change nothing.
      await expectApiError(json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-2')] }, revision: read.revision }), 409, 'venue_layout_changed')
      const body = new FormData()
      body.append('file', new Blob([pngBytes(20, 10) as BlobPart], { type: 'image/png' }), 'plan.png')
      const stale = await fetch(`${operationsApi.admin.venueUnderlay(operation.id)}?revision=${encodeURIComponent(read.revision)}`, { method: 'POST', body, headers: { cookie: staff.cookie } })
      expect(stale.status).toBe(409)
      expect((await stale.json() as Json).data?.code).toBe('venue_layout_changed')
      const now = await ok(await json(staff.cookie, 'GET', operationsApi.admin.venueLayout(operation.id)))
      expect(now).toEqual(first)

      // With the current revision both go through, and the upload answers the next one.
      const fresh = new FormData()
      fresh.append('file', new Blob([pngBytes(20, 10) as BlobPart], { type: 'image/png' }), 'plan.png')
      const uploaded = await fetch(`${operationsApi.admin.venueUnderlay(operation.id)}?revision=${encodeURIComponent(first.revision)}`, { method: 'POST', body: fresh, headers: { cookie: staff.cookie } })
      expect(uploaded.status, await uploaded.clone().text()).toBe(200)
      const underlay = await uploaded.json() as Json
      const saved = await ok(await json(staff.cookie, 'PUT', operationsApi.admin.venueLayout(operation.id), { layout: { features: [station('bar-1'), station('bar-2')] }, revision: underlay.revision }))
      expect(saved.features).toHaveLength(2)
      expect(saved.underlay).toEqual({ url: underlay.url, width: 20, height: 10 })
    })
  })

  describe('status machine', () => {
    it('moves along planning -> active -> wrapped_up -> archived and fires operations:status-changed', async () => {
      const operation = await createOperation()
      expect(operation.status).toBe('planning')
      const before = (await getStatusChanges()).length

      for (const [to, from] of [['active', 'planning'], ['wrapped_up', 'active'], ['archived', 'wrapped_up']]) {
        expect(await ok(await setStatus(operation.id, to!))).toMatchObject({ id: operation.id, status: to })
        const changes = (await getStatusChanges()).filter(change => change.id === operation.id)
        expect(changes.at(-1)).toEqual({ id: operation.id, from, to })
      }
      expect((await getStatusChanges()).length - before).toBe(3)
    })

    it('fires operations:created and operations:updated, and not for a patch that changes nothing', async () => {
      const operation = await createOperation()
      expect(await getHooksFor(operation.id)).toEqual(['created'])

      await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { name: 'Renamed for the hook' }))
      expect(await getHooksFor(operation.id)).toEqual(['created', 'updated:renamed'])

      // Same values, an empty body, and a slug it already has: nothing changed, no hook.
      await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { name: 'Renamed for the hook', slug: operation.slug }))
      await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), {}))
      await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { startsAt: operation.startsAt }))
      expect(await getHooksFor(operation.id)).toEqual(['created', 'updated:renamed'])

      await ok(await setStatus(operation.id, 'active'))
      expect(await getHooksFor(operation.id)).toEqual(['created', 'updated:renamed', 'status-changed'])
    })

    it('lets a plan that never happens go straight to archived', async () => {
      const operation = await createOperation()
      expect(await ok(await setStatus(operation.id, 'archived'))).toMatchObject({ status: 'archived' })
    })

    it('answers 409 invalid_status_transition for every other move, without firing the hook', async () => {
      const operation = await createOperation()
      const before = (await getStatusChanges()).length
      for (const to of ['planning', 'wrapped_up']) {
        const error = await expectApiError(setStatus(operation.id, to), 409, 'invalid_status_transition')
        expect(error.data).toMatchObject({ from: 'planning', to })
      }
      await ok(await setStatus(operation.id, 'active'))
      await expectApiError(setStatus(operation.id, 'archived'), 409, 'invalid_status_transition')
      await expectApiError(setStatus(operation.id, 'planning'), 409, 'invalid_status_transition')
      await ok(await setStatus(operation.id, 'wrapped_up'))
      await ok(await setStatus(operation.id, 'archived'))
      for (const to of ['planning', 'active', 'wrapped_up', 'archived']) {
        await expectApiError(setStatus(operation.id, to), 409, 'invalid_status_transition')
      }
      expect((await getStatusChanges()).length - before).toBe(3)
    })

    it('rejects an unknown status with 400 and an unknown operation with 404', async () => {
      const operation = await createOperation()
      expect((await setStatus(operation.id, 'done')).status).toBe(400)
      await expectApiError(setStatus('opr_missing', 'active'), 404, 'not_found')
    })

    it('does not let PATCH change the status', async () => {
      const operation = await createOperation()
      const patched = await ok(await json(staff.cookie, 'PATCH', operationsApi.admin.operation(operation.id), { status: 'archived' }))
      expect(patched.status).toBe('planning')
    })
  })

  describe('public API', () => {
    it('shows anonymous visitors the public operations only, and 404s the rest', async () => {
      const marker = `pub${++counter}`
      const open = await createOperation({ slug: `${marker}-open`, public: true })
      const closed = await createOperation({ slug: `${marker}-closed`, public: false })

      const list = await ok(await json(undefined, 'GET', operationsApi.list)) as unknown as Json[]
      const ids = list.map(item => item.id)
      expect(ids).toContain(open.id)
      expect(ids).not.toContain(closed.id)

      expect(await ok(await json(undefined, 'GET', operationsApi.operation(open.slug)))).toMatchObject({ id: open.id, slug: open.slug })
      await expectApiError(json(undefined, 'GET', operationsApi.operation(closed.slug)), 404, 'not_found')
      await expectApiError(json(undefined, 'GET', operationsApi.operation('does-not-exist')), 404, 'not_found')

      // The public DTO has no audit dates.
      expect(await ok(await json(undefined, 'GET', operationsApi.operation(open.slug)))).not.toHaveProperty('createdAt')
    })

    it('hides archived operations from the list unless asked for them', async () => {
      const operation = await createOperation({ public: true })
      await ok(await setStatus(operation.id, 'archived'))
      const list = await ok(await json(undefined, 'GET', operationsApi.list)) as unknown as Json[]
      expect(list.map(item => item.id)).not.toContain(operation.id)
      const archived = await ok(await json(undefined, 'GET', `${operationsApi.list}?status=archived`)) as unknown as Json[]
      expect(archived.map(item => item.id)).toContain(operation.id)
      // Still reachable by its URL name while public.
      expect(await ok(await json(undefined, 'GET', operationsApi.operation(operation.slug)))).toMatchObject({ status: 'archived' })
    })

    it('filters the list by status', async () => {
      const active = await createOperation({ public: true })
      await ok(await setStatus(active.id, 'active'))
      const planning = await createOperation({ public: true })
      const list = await ok(await json(undefined, 'GET', `${operationsApi.list}?status=active`)) as unknown as Json[]
      expect(list.map(item => item.id)).toContain(active.id)
      expect(list.map(item => item.id)).not.toContain(planning.id)
      expect((await json(undefined, 'GET', `${operationsApi.list}?status=bogus`)).status).toBe(400)
    })

    it('shows a signed-in user the public operations plus the ones they take part in', async () => {
      const member = await user('Member')
      const outsider = await user('Outsider')
      const marker = `own${++counter}`
      const open = await createOperation({ slug: `${marker}-open`, public: true })
      const mine = await createOperation({ slug: `${marker}-mine`, public: false })
      const theirs = await createOperation({ slug: `${marker}-theirs`, public: false })
      await participate(member.cookie, mine.id)

      const memberIds = ((await ok(await json(member.cookie, 'GET', operationsApi.list))) as unknown as Json[]).map(item => item.id)
      expect(memberIds).toContain(open.id)
      expect(memberIds).toContain(mine.id)
      expect(memberIds).not.toContain(theirs.id)

      const outsiderIds = ((await ok(await json(outsider.cookie, 'GET', operationsApi.list))) as unknown as Json[]).map(item => item.id)
      expect(outsiderIds).toContain(open.id)
      expect(outsiderIds).not.toContain(mine.id)

      // By URL name: participants read their operation, everybody else gets the 404 of an unknown one.
      expect(await ok(await json(member.cookie, 'GET', operationsApi.operation(mine.slug)))).toMatchObject({ id: mine.id })
      await expectApiError(json(member.cookie, 'GET', operationsApi.operation(theirs.slug)), 404, 'not_found')
      await expectApiError(json(outsider.cookie, 'GET', operationsApi.operation(mine.slug)), 404, 'not_found')
      await expectApiError(json(undefined, 'GET', operationsApi.operation(mine.slug)), 404, 'not_found')
    })

    it('shows staff a non-public operation by its URL name', async () => {
      const closed = await createOperation({ public: false })
      expect(await ok(await json(staff.cookie, 'GET', operationsApi.operation(closed.slug)))).toMatchObject({ id: closed.id })
    })

    it('treats a token without operations:read as anonymous on the public API', async () => {
      const member = await user('Tokenmember')
      const mine = await createOperation({ public: false })
      await participate(member.cookie, mine.id)
      const withRead = apiClient({ bearer: await createToken(member.cookie, [operationsAccess.permissions.read]) })
      expect((await withRead.json<Json[]>('GET', operationsApi.list)).map(item => item.id)).toContain(mine.id)

      // A token that holds some other scope, but not `operations:read`.
      const scopes = await ok(await json(member.cookie, 'GET', authApi.scopes)) as unknown as Array<{ name: string }>
      const other = scopes.map(scope => scope.name).find(name => !name.startsWith('operations'))!
      const profileOnly = apiClient({ bearer: await createToken(member.cookie, [other]) })
      expect((await profileOnly.json<Json[]>('GET', operationsApi.list)).map(item => item.id)).not.toContain(mine.id)
      await expectApiError(profileOnly.json('GET', operationsApi.operation(mine.slug)), 404, 'not_found')
    })
  })

  describe('GET /api/operations/me', () => {
    it('requires a signed-in user', async () => {
      expect((await json(undefined, 'GET', operationsApi.me.operations)).status).toBe(401)
    })

    it('refuses a token without operations:read (insufficient_scope)', async () => {
      const member = await user('Metoken')
      const scopes = await ok(await json(member.cookie, 'GET', authApi.scopes)) as unknown as Array<{ name: string }>
      const other = scopes.map(scope => scope.name).find(name => !name.startsWith('operations'))!
      await expectApiError(apiClient({ bearer: await createToken(member.cookie, [other]) }).json('GET', operationsApi.me.operations), 403, 'insufficient_scope')
      const named = apiClient({ bearer: await createToken(member.cookie, ['operations']) })
      expect(await named.json('GET', operationsApi.me.operations)).toEqual([])
    })

    it('lists the operations the caller takes part in, whatever their visibility or status', async () => {
      const member = await user('Crew')
      const none = await user('Nocrew')
      const closed = await createOperation({ public: false })
      const archived = await createOperation({ public: true })
      await ok(await setStatus(archived.id, 'archived'))
      await createOperation({ public: true })
      await participate(member.cookie, closed.id)
      await participate(member.cookie, archived.id)

      const mine = await ok(await json(member.cookie, 'GET', operationsApi.me.operations)) as unknown as Json[]
      expect(mine.map(item => item.id).sort()).toEqual([closed.id, archived.id].sort())
      expect(await ok(await json(none.cookie, 'GET', operationsApi.me.operations))).toEqual([])
    })

    it('is not shadowed by the :slug route, and `me` cannot be a slug', async () => {
      const member = await user('Shadow')
      expect(Array.isArray(await ok(await json(member.cookie, 'GET', operationsApi.me.operations)))).toBe(true)
      staff ??= await registerUser('Staff', 'staff@staff.test')
      expect((await json(staff.cookie, 'POST', operationsApi.admin.operations, { slug: 'me', name: 'Me', startsAt: future(1) })).status).toBe(400)
    })
  })

  describe('the operation grant kind', () => {
    it('admits the people who take part, and lists them', async () => {
      const member = await user('Grantmember')
      const outsider = await user('Grantoutsider')
      const operation = await createOperation({ public: false })
      await participate(member.cookie, operation.id)
      const grants = [{ kind: 'operation', operationId: operation.id }]

      const forMember = await evaluateGrants(member.cookie, grants)
      expect(forMember.matches).toBe(true)
      expect(forMember.members).toHaveLength(1)
      expect((await evaluateGrants(outsider.cookie, grants)).matches).toBe(false)
      // Anonymous callers match no operation grant, and the empty list admits nobody.
      expect((await evaluateGrants(undefined, grants)).matches).toBe(false)
      expect((await evaluateGrants(member.cookie, [])).matches).toBe(false)
      // An invalid grant of the kind admits nobody.
      expect((await evaluateGrants(member.cookie, [{ kind: 'operation', operationId: operation.id, extra: 1 }])).matches).toBe(false)
    })

    it('refuses a grant naming an operation that does not exist', async () => {
      const operation = await createOperation({})
      expect((await validateGrants([{ kind: 'operation', operationId: operation.id }])).status).toBe(200)
      expect((await validateGrants([{ kind: 'operation', operationId: 'opr_missing' }])).status).toBe(400)
      expect((await validateGrants([{ kind: 'galaxy' }])).status).toBe(400)
    })
  })

  describe('pages', () => {
    it('renders the admin list and the operation page with a tab another module added', async () => {
      const operation = await createOperation({ name: 'Page test operation' })
      const list = await fetch('/admin/operations', { headers: { cookie: staff.cookie } })
      expect(list.status).toBe(200)
      expect(await list.text()).toContain('Operations')

      const page = await fetch(`/admin/operations/${operation.id}`, { headers: { cookie: staff.cookie } })
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('Page test operation')
      expect(html).toContain('Details')
      expect(html).toContain('Test tab')
    }, 180_000)

    it('renders the public page of a public operation and 404s a private one', async () => {
      const open = await createOperation({ name: 'Visible operation', public: true, hostName: 'Summer Festival' })
      const closed = await createOperation({ public: false })
      const visible = await fetch(`/operations/${open.slug}`)
      expect(visible.status).toBe(200)
      expect(await visible.text()).toContain('Visible operation')
      expect((await fetch(`/operations/${closed.slug}`)).status).toBe(404)
    }, 180_000)

    it('keeps the public page for public operations only, participants and staff included', async () => {
      const member = await user('Pagecrew')
      const closed = await createOperation({ name: 'Private operation', public: false })
      await participate(member.cookie, closed.id)
      // The API lets them read it...
      expect((await json(member.cookie, 'GET', operationsApi.operation(closed.slug))).status).toBe(200)
      expect((await json(staff.cookie, 'GET', operationsApi.operation(closed.slug))).status).toBe(200)
      // ...the public page does not exist for it.
      expect((await fetch(`/operations/${closed.slug}`, { headers: { cookie: member.cookie } })).status).toBe(404)
      expect((await fetch(`/operations/${closed.slug}`, { headers: { cookie: staff.cookie } })).status).toBe(404)
    }, 180_000)

    it('keeps the admin pages behind the staff permission', async () => {
      const nobody = await user('Pagenobody')
      const operation = await createOperation()
      // The pages render their own forbidden state from the API's answer.
      const html = await (await fetch(`/admin/operations/${operation.id}`, { headers: { cookie: nobody.cookie } })).text()
      expect(html).toContain('You do not have access to operations')
      expect(html).not.toContain(operation.slug)
      const list = await (await fetch('/admin/operations', { headers: { cookie: nobody.cookie } })).text()
      expect(list).toContain('You do not have access to operations')
    }, 180_000)
  })
})
