import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { mapsApi } from '../src/runtime/utils/api'
import { mapsAccess } from '../src/runtime/access'
import { pngBytes } from './images'
import { createToken, ensureMapOnServer, getMapsLog, grantTeamRole, postForm, registerUser } from './helpers'

type Session = Awaited<ReturnType<typeof registerUser>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const as = (session?: Session) => apiClient({ cookie: session?.cookie })
const point = (x: number, y: number) => ({ type: 'Point', coordinates: [x, y] })
const square = (size = 100) => ({ type: 'Polygon', coordinates: [[[0, 0], [size, 0], [size, size], [0, size], [0, 0]]] })
let counter = 0

function imageForm(bytes: Uint8Array, width: number, height: number, type = 'image/png', name = 'plan.png') {
  const form = new FormData()
  form.append('file', new Blob([bytes as BlobPart], { type }), name)
  form.append('width', String(width))
  form.append('height', String(height))
  return form
}

describe('maps (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: Session
  let plain: Session
  beforeAll(async () => {
    staff = await registerUser('Staff', 'staff.test')
    plain = await registerUser('Plain')
  })

  async function createMap(body: Json): Promise<Json> {
    return as(staff).json<Json>('POST', mapsApi.admin.maps, { ownerType: 'platform', name: `Map ${++counter}`, ...body })
  }

  describe('maps from code', () => {
    it('creates the seeded maps once, on the first request', async () => {
      const site = await as().json<Json>('GET', mapsApi.map('seeded-site'))
      expect(site.map).toMatchObject({ key: 'seeded-site', kind: 'maps.generic-geo', base: 'geo', public: true, ownerType: 'platform', ownerId: null })
      expect(site.features.map((feature: Json) => feature.featureKind).sort()).toEqual(['maps.area', 'maps.marker'])
      await as(plain).json('GET', mapsApi.list)
      expect((await getMapsLog()).seedCalls).toBe(1)

      const owned = await as(staff).json<Json>('GET', `${mapsApi.admin.maps}?ownerType=operation&ownerId=opr_seed`)
      expect(owned.items).toHaveLength(1)
      expect(owned.items[0]).toMatchObject({ key: 'first-aid-opr_seed', kind: 'first-aid', source: 'code', ownerLabel: { en: 'Owner opr_seed' } })
      const detail = await as(staff).json<Json>('GET', mapsApi.admin.map(owned.items[0].id))
      expect(detail.layers.map((layer: Json) => [layer.key, layer.editable, layer.featureCount])).toEqual([['posts', true, 1], ['reference', false, 0]])
    })

    it('ensureMap is idempotent by key and never touches an existing map', async () => {
      const definition = { key: `first-aid-opr_${++counter}`, kind: 'first-aid', owner: { type: 'operation', id: `opr_${counter}` }, name: 'First aid' }
      const first = await ensureMapOnServer<Json>(definition)
      const second = await ensureMapOnServer<Json>({ ...definition, name: 'Renamed', features: [{ featureKind: 'first-aid.post', geometry: point(12, 55), properties: { capacity: 1 } }] })
      expect(second.id).toBe(first.id)
      expect(second.name).toBe('First aid')
      expect(first.view).toEqual({ center: [55.617, 12.079], zoom: 15 })
      const read = await as(staff).json<Json>('GET', mapsApi.map(definition.key))
      expect(read.features).toEqual([])
    })

    it('ensureMap validates the kind, the owner and the features', async () => {
      await expectApiError(ensureMapOnServer({ key: `x-${++counter}`, kind: 'nope', owner: { type: 'platform', id: null }, name: 'X' }), 400)
      await expectApiError(ensureMapOnServer({ key: `x-${++counter}`, kind: 'first-aid', owner: { type: 'operation', id: 'opr_missing' }, name: 'X' }), 400)
      await expectApiError(ensureMapOnServer({ key: `x-${++counter}`, kind: 'first-aid', owner: { type: 'team', id: 'tem_1' }, name: 'X' }), 400)
      await expectApiError(ensureMapOnServer({
        key: `x-${++counter}`,
        kind: 'first-aid',
        owner: { type: 'operation', id: 'opr_1' },
        name: 'X',
        features: [{ featureKind: 'first-aid.post', geometry: point(12, 55), properties: { capacity: -1 } }],
      }), 400)
    })
  })

  describe('visibility', () => {
    let publicMap: Json, signedIn: Json, vipOnly: Json, baOnly: Json

    // Nested suites set up in their first test: `@nuxt/test-utils`' context is not available in a nested `beforeAll`.
    it('sets up maps with different visibilities', async () => {
      publicMap = await createMap({ kind: 'maps.generic-geo', visibility: { public: true } })
      signedIn = await createMap({ kind: 'maps.generic-geo' })
      vipOnly = await createMap({ kind: 'maps.generic-geo', visibility: { globalRoles: ['vip'] } })
      baOnly = await createMap({ kind: 'maps.generic-geo', visibility: { minTeamRole: { kind: 'bar', role: 'ba' } } })
      expect([publicMap.public, signedIn.public, vipOnly.visibility, baOnly.visibility]).toEqual([true, false, { globalRoles: ['vip'] }, { minTeamRole: { kind: 'bar', role: 'ba' } }])
    })

    it('shows public maps to everyone and asks anonymous visitors to sign in for the rest', async () => {
      expect((await as().json<Json>('GET', mapsApi.map(publicMap.id))).map.id).toBe(publicMap.id)
      await expectApiError(as().json('GET', mapsApi.map(signedIn.id)), 401)
      await expectApiError(as().json('GET', mapsApi.map('no-such-map')), 401)
      const listed = (await as().json<Json[]>('GET', mapsApi.list)).map(map => map.id)
      expect(listed).toContain(publicMap.id)
      expect(listed).not.toContain(signedIn.id)
    })

    it('filters by global role and team role, with the same 404 as an unknown map', async () => {
      expect((await as(plain).json<Json>('GET', mapsApi.map(signedIn.id))).map.id).toBe(signedIn.id)
      await expectApiError(as(plain).json('GET', mapsApi.map(vipOnly.id)), 404, 'not_found')
      await expectApiError(as(plain).json('GET', mapsApi.map('no-such-map')), 404, 'not_found')
      const vip = await registerUser('Vip', 'vip.test')
      expect((await as(vip).json<Json>('GET', mapsApi.map(vipOnly.id))).map.id).toBe(vipOnly.id)

      const volunteer = await registerUser('Volunteer')
      await grantTeamRole(volunteer.cookie, 'bar', 'volunteer')
      await expectApiError(as(volunteer).json('GET', mapsApi.map(baOnly.id)), 404)
      const ba = await registerUser('Ba')
      await grantTeamRole(ba.cookie, 'bar', 'ba')
      expect((await as(ba).json<Json>('GET', mapsApi.map(baOnly.id))).map.id).toBe(baOnly.id)
      const listed = (await as(ba).json<Json[]>('GET', mapsApi.list)).map(map => map.id)
      expect(listed).toEqual(expect.arrayContaining([publicMap.id, signedIn.id, baOnly.id]))
      expect(listed).not.toContain(vipOnly.id)
    })

    it('shows every map to staff', async () => {
      const listed = (await as(staff).json<Json[]>('GET', mapsApi.list)).map(map => map.id)
      expect(listed).toEqual(expect.arrayContaining([publicMap.id, signedIn.id, vipOnly.id, baOnly.id]))
    })

    it('lets a layer narrow the map: its features stay hidden from those it leaves out', async () => {
      const layer = await as(staff).json<Json>('POST', mapsApi.admin.layers(publicMap.id), { key: 'vip-only', name: 'VIP', visibility: { globalRoles: ['vip'] } })
      await as(staff).json('POST', mapsApi.features(publicMap.id), { layerId: layer.id, featureKind: 'maps.marker', geometry: point(12, 55), label: 'Secret' })
      const anonymous = await as().json<Json>('GET', mapsApi.map(publicMap.id))
      expect(anonymous.layers.map((entry: Json) => entry.key)).toEqual(['features'])
      expect(anonymous.features).toEqual([])
      const vip = await registerUser('Vip', 'vip.test')
      const seen = await as(vip).json<Json>('GET', mapsApi.map(publicMap.id))
      expect(seen.layers.map((entry: Json) => entry.key)).toEqual(['features', 'vip-only'])
      expect(seen.features).toHaveLength(1)
    })

    it('answers tokens without maps:read with insufficient_scope', async () => {
      const token = await createToken(plain.cookie, [mapsAccess.permissions.edit])
      await expectApiError(apiClient({ bearer: token }).json('GET', mapsApi.map(signedIn.id)), 403, 'insufficient_scope')
      const reader = await createToken(plain.cookie, ['maps'])
      expect((await apiClient({ bearer: reader }).json<Json>('GET', mapsApi.map(signedIn.id))).map.id).toBe(signedIn.id)
    })
  })

  describe('provider layers', () => {
    it('serves a layer only to holders of its permission', async () => {
      const url = mapsApi.layer('seeded-site', 'test.on-duty')
      await expectApiError(as().json('GET', url), 401)
      await expectApiError(as(plain).json('GET', url), 403, 'forbidden')
      const reader = await registerUser('Reader', 'shifts.test')
      const collection = await as(reader).json<Json>('GET', url)
      expect(collection.type).toBe('FeatureCollection')
      // The provider's invalid feature is dropped.
      expect(collection.features).toEqual([{ type: 'Feature', id: 'duty-1', geometry: point(12.08, 55.62), properties: { label: { da: 'Anna (BA)', en: 'Anna (BA)' } } }])

      const detail = await as(reader).json<Json>('GET', mapsApi.map('seeded-site'))
      expect(detail.providerLayers.map((layer: Json) => layer.key)).toEqual(['test.on-duty', 'test.open'])
      const anonymous = await as().json<Json>('GET', mapsApi.map('seeded-site'))
      expect(anonymous.providerLayers.map((layer: Json) => layer.key)).toEqual(['test.open'])
    })

    it('serves a layer without a permission to whoever reads the map, and 404s a layer that does not apply', async () => {
      const open = await as().json<Json>('GET', mapsApi.layer('seeded-site', 'test.open'))
      expect(open.features).toHaveLength(1)
      await expectApiError(as().json('GET', mapsApi.layer('seeded-site', 'nope')), 404)
      await expectApiError(as(staff).json('GET', mapsApi.layer('first-aid-opr_seed', 'test.open')), 404)
    })
  })

  describe('features', () => {
    let map: Json
    let firstAid: Session

    it('sets up a first aid map and a user holding the kind\'s editPermission', async () => {
      map = await ensureMapOnServer<Json>({ key: `first-aid-opr_feat${++counter}`, kind: 'first-aid', owner: { type: 'operation', id: `opr_feat${counter}` }, name: 'First aid' })
      firstAid = await registerUser('Medic', 'firstaid.test')
      expect(map.kind).toBe('first-aid')
    })

    const post = (session: Session | undefined, body: Json) => as(session).json<Json>('POST', mapsApi.features(map.key), body)

    it('needs maps:edit: anonymous 401, others 403', async () => {
      await expectApiError(post(undefined, { featureKind: 'first-aid.post', geometry: point(12, 55), properties: { capacity: 1 } }), 401)
      await expectApiError(post(plain, { featureKind: 'first-aid.post', geometry: point(12, 55), properties: { capacity: 1 } }), 403, 'forbidden')
      await expectApiError(as().json('POST', mapsApi.features('no-such-map'), {}), 401)
    })

    it('lets the kind\'s editPermission draw, validated against the feature kind', async () => {
      const created = await post(firstAid, { featureKind: 'first-aid.post', geometry: point(12.08, 55.61), properties: { capacity: 3 }, label: { da: 'Post 2', en: 'Post 2' } })
      expect(created).toMatchObject({ featureKind: 'first-aid.post', properties: { capacity: 3, level: 'basic' }, geometry: point(12.08, 55.61) })
      expect(created.id).toMatch(/^mpf_/)

      const badProps = await expectApiError(post(firstAid, { featureKind: 'first-aid.post', geometry: point(12, 55), properties: { capacity: -1 } }), 400, 'validation_failed')
      expect(JSON.stringify(badProps.data)).toContain('capacity')
      await expectApiError(post(firstAid, { featureKind: 'first-aid.post', geometry: point(12, 55), properties: {} }), 400, 'validation_failed')
      await expectApiError(post(firstAid, { featureKind: 'first-aid.post', geometry: { type: 'LineString', coordinates: [[12, 55], [12.1, 55.1]] }, properties: { capacity: 1 } }), 400, 'validation_failed')
      await expectApiError(post(firstAid, { featureKind: 'first-aid.post', geometry: point(500, 55), properties: { capacity: 1 } }), 400, 'validation_failed')
      await expectApiError(post(firstAid, { featureKind: 'maps.area', geometry: square(), properties: {} }), 400, 'validation_failed')
      await expectApiError(post(firstAid, { featureKind: 'first-aid.post', geometry: point(12, 55), properties: { capacity: 1 }, linkMapId: 'map_nope' }), 400, 'validation_failed')
    })

    it('refuses features on a layer that is not editable', async () => {
      const detail = await as(staff).json<Json>('GET', mapsApi.admin.map(map.id))
      const reference = detail.layers.find((layer: Json) => layer.key === 'reference')
      await expectApiError(post(firstAid, { layerId: reference.id, featureKind: 'maps.marker', geometry: point(12, 55) }), 409, 'layer_not_editable')
    })

    it('updates and deletes features, firing the hooks with the map and the previous feature', async () => {
      const created = await post(firstAid, { featureKind: 'maps.marker', geometry: point(12, 55), label: 'Before', properties: { description: 'Tent' } })
      const updated = await as(firstAid).json<Json>('PATCH', mapsApi.feature(map.id, created.id), { label: 'After', geometry: point(12.01, 55.01) })
      expect(updated).toMatchObject({ label: 'After', geometry: point(12.01, 55.01), properties: { description: 'Tent' } })
      await expectApiError(as(firstAid).json('PATCH', mapsApi.feature(map.id, created.id), { properties: { description: 5 } }), 400)
      await expectApiError(as(plain).json('PATCH', mapsApi.feature(map.id, created.id), { label: 'Nope' }), 403)
      await expectApiError(as(firstAid).json('PATCH', mapsApi.feature(map.id, 'mpf_missing'), { label: 'Nope' }), 404)

      const response = await as(firstAid).fetch('DELETE', mapsApi.feature(map.id, created.id))
      expect(response.status).toBe(204)
      const hooks = (await getMapsLog()).hooks.filter(entry => entry.featureId === created.id)
      expect(hooks.map(entry => entry.name)).toEqual(['created', 'updated', 'deleted'])
      expect(hooks[1]!.previousLabel).toBe('Before')
      expect(hooks.every(entry => entry.mapId === map.id)).toBe(true)
    })

    it('lets an owner module allow editing through maps:edit:resolve, and staff through maps:manage', async () => {
      const venue = await createMap({ kind: 'test.venue', ownerType: 'team', ownerId: 'tem_lead' })
      const lead = await registerUser('Lead', 'lead.test')
      const area = { featureKind: 'maps.area', geometry: square(40), properties: { color: 'warning' } }
      expect((await as(lead).json<Json>('POST', mapsApi.features(venue.id), area)).featureKind).toBe('maps.area')
      await expectApiError(as(plain).json('POST', mapsApi.features(venue.id), area), 403)
      await expectApiError(as(firstAid).json('POST', mapsApi.features(venue.id), area), 403)
      expect((await as(staff).json<Json>('POST', mapsApi.features(venue.id), area)).id).toMatch(/^mpf_/)
      expect((await as(lead).json<Json>('GET', mapsApi.map(venue.id))).canEdit).toBe(true)
      expect((await as(plain).json<Json>('GET', mapsApi.map(venue.id))).canEdit).toBe(false)
    })

    it('lets a token edit with maps:edit plus the kind\'s permission, and refuses one without', async () => {
      const withBoth = await createToken(firstAid.cookie, [mapsAccess.permissions.edit, 'first-aid:manage'])
      expect((await apiClient({ bearer: withBoth }).json<Json>('POST', mapsApi.features(map.id), { featureKind: 'maps.marker', geometry: point(12, 55) })).id).toMatch(/^mpf_/)
      const readOnly = await createToken(firstAid.cookie, [mapsAccess.permissions.read])
      await expectApiError(apiClient({ bearer: readOnly }).json('POST', mapsApi.features(map.id), { featureKind: 'maps.marker', geometry: point(12, 55) }), 403, 'insufficient_scope')
      const editOnly = await createToken(firstAid.cookie, [mapsAccess.permissions.edit])
      await expectApiError(apiClient({ bearer: editOnly }).json('POST', mapsApi.features(map.id), { featureKind: 'maps.marker', geometry: point(12, 55) }), 403, 'forbidden')
    })
  })

  describe('admin', () => {
    it('denies the admin API by default: anonymous 401, others 403, tokens without maps:manage insufficient_scope', async () => {
      await expectApiError(as().json('GET', mapsApi.admin.maps), 401)
      await expectApiError(as().json('DELETE', mapsApi.admin.map('map_missing')), 401)
      await expectApiError(as(plain).json('GET', mapsApi.admin.maps), 403, 'forbidden')
      await expectApiError(as(plain).json('POST', mapsApi.admin.maps, { kind: 'maps.generic-geo', ownerType: 'platform', name: 'X' }), 403, 'forbidden')
      await expectApiError(as(plain).json('PATCH', mapsApi.admin.map('map_missing'), {}), 403)
      const readOnly = await createToken(staff.cookie, [mapsAccess.permissions.read])
      await expectApiError(apiClient({ bearer: readOnly }).json('GET', mapsApi.admin.maps), 403, 'insufficient_scope')
      const manage = await createToken(staff.cookie, [mapsAccess.permissions.manage])
      expect((await apiClient({ bearer: manage }).json<Json>('GET', mapsApi.admin.maps)).total).toBeGreaterThan(0)
    })

    it('creates, reads, edits and deletes a map', async () => {
      const created = await createMap({ kind: 'maps.generic-plane', name: { da: 'Bar', en: 'Bar' }, key: `bar-${++counter}` })
      expect(created).toMatchObject({ base: 'plane', source: 'admin', view: { bounds: [[0, 0], [1000, 1000]] }, visibility: null, public: false })
      expect(created.id).toMatch(/^map_/)
      const detail = await as(staff).json<Json>('GET', mapsApi.admin.map(created.id))
      expect(detail.layers.map((layer: Json) => layer.key)).toEqual(['features'])

      const patched = await as(staff).json<Json>('PATCH', mapsApi.admin.map(created.id), { name: 'Renamed', visibility: { public: true }, view: { bounds: [[0, 0], [600, 800]] } })
      expect(patched).toMatchObject({ name: 'Renamed', public: true, view: { bounds: [[0, 0], [600, 800]] } })
      await expectApiError(as(staff).json('PATCH', mapsApi.admin.map(created.id), { view: { center: [0, 0], zoom: 3 } }), 400)
      await expectApiError(as(staff).json('PATCH', mapsApi.admin.map(created.id), { visibility: { permission: 'x' } }), 400)
      await expectApiError(as(staff).json('PATCH', mapsApi.admin.map(created.id), { key: 'seeded-site' }), 409, 'conflict')

      const list = await as(staff).json<Json>('GET', `${mapsApi.admin.maps}?q=renamed&kind=maps.generic-plane`)
      expect(list.items.map((item: Json) => item.id)).toContain(created.id)

      expect((await as(staff).fetch('DELETE', mapsApi.admin.map(created.id))).status).toBe(204)
      await expectApiError(as(staff).json('GET', mapsApi.admin.map(created.id)), 404, 'not_found')
    })

    it('validates the kind and the owner', async () => {
      await expectApiError(createMap({ kind: 'nope' }), 400)
      await expectApiError(createMap({ kind: 'maps.generic-geo', ownerType: 'operation', ownerId: 'opr_missing' }), 400)
      await expectApiError(createMap({ kind: 'maps.generic-geo', ownerType: 'galaxy', ownerId: 'g1' }), 400)
      await expectApiError(createMap({ kind: 'maps.generic-geo', ownerType: 'platform', ownerId: 'p1' }), 400)
      await expectApiError(createMap({ kind: 'first-aid', ownerType: 'team', ownerId: 'tem_1' }), 400)
      await expectApiError(createMap({ kind: 'maps.generic-geo', view: { bounds: [[0, 0], [1, 1]] } }), 400)
      const owned = await createMap({ kind: 'first-aid', ownerType: 'operation', ownerId: 'opr_admin' })
      expect(owned).toMatchObject({ ownerType: 'operation', ownerId: 'opr_admin', ownerLabel: { en: 'Owner opr_admin' } })
    })

    it('manages layers: unique keys, provider keys taken, editable and visibility', async () => {
      const map = await createMap({ kind: 'maps.generic-geo' })
      const layer = await as(staff).json<Json>('POST', mapsApi.admin.layers(map.id), { key: 'stations', name: 'Stations', sort: 2 })
      expect(layer).toMatchObject({ key: 'stations', visible: true, editable: true, visibility: null })
      await expectApiError(as(staff).json('POST', mapsApi.admin.layers(map.id), { key: 'stations', name: 'Again' }), 409)
      const seeded = await as().json<Json>('GET', mapsApi.map('seeded-site'))
      await expectApiError(as(staff).json('POST', mapsApi.admin.layers(seeded.map.id), { key: 'test.open', name: 'Taken' }), 409)

      const patched = await as(staff).json<Json>('PATCH', mapsApi.admin.layer(map.id, layer.id), { editable: false, visibility: { globalRoles: ['vip'] } })
      expect(patched).toMatchObject({ editable: false, visibility: { globalRoles: ['vip'] } })
      expect((await as(staff).fetch('DELETE', mapsApi.admin.layer(map.id, layer.id))).status).toBe(204)
      await expectApiError(as(staff).json('PATCH', mapsApi.admin.layer(map.id, layer.id), { name: 'Gone' }), 404)
    })

    it('uploads and serves a floor plan with type and size checks', async () => {
      const plan = await createMap({ kind: 'maps.generic-plane' })
      const png = pngBytes(40, 30)
      const ok = await postForm(mapsApi.admin.underlay(plan.id), imageForm(png, 40, 30), staff.cookie)
      expect(ok.status, await ok.clone().text()).toBe(200)
      const saved = await ok.json() as Json
      expect(saved.underlay).toMatchObject({ width: 40, height: 30, bounds: [[0, 0], [30, 40]] })
      expect(saved.underlay.url).toContain(mapsApi.underlay(plan.id))
      expect(saved.underlay.pathname).toBeUndefined()
      expect(saved.view).toEqual({ bounds: [[0, 0], [30, 40]] })

      const served = await fetch(saved.underlay.url, { headers: { cookie: plain.cookie } })
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).toBe('image/png')
      expect(served.headers.get('x-content-type-options')).toBe('nosniff')
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(png)
      expect((await fetch(mapsApi.underlay(plan.id))).status).toBe(401)

      expect((await postForm(mapsApi.admin.underlay(plan.id), imageForm(png, 41, 30), staff.cookie)).status).toBe(400)
      const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
      expect((await postForm(mapsApi.admin.underlay(plan.id), imageForm(svg, 10, 10, 'image/png', 'plan.png'), staff.cookie)).status).toBe(415)
      const big = new Uint8Array(250_000)
      big.set(png.subarray(0, 24))
      expect((await postForm(mapsApi.admin.underlay(plan.id), imageForm(big, 40, 30), staff.cookie)).status).toBe(413)
      expect((await postForm(mapsApi.admin.underlay(plan.id), imageForm(png, 40, 30), plain.cookie)).status).toBe(403)
      expect((await postForm(mapsApi.admin.underlay(plan.id), imageForm(png, 40, 30))).status).toBe(401)

      const geo = await createMap({ kind: 'maps.generic-geo' })
      expect((await postForm(mapsApi.admin.underlay(geo.id), imageForm(png, 40, 30), staff.cookie)).status).toBe(400)

      await as(staff).json('PATCH', mapsApi.admin.map(plan.id), { visibility: { public: true } })
      const anonymous = await fetch(saved.underlay.url)
      expect(anonymous.status).toBe(200)
      expect(anonymous.headers.get('cache-control')).toContain('public')

      const removed = await as(staff).json<Json>('DELETE', mapsApi.admin.underlay(plan.id))
      expect(removed.underlay).toBeNull()
      expect((await fetch(mapsApi.underlay(plan.id))).status).toBe(404)
    })
  })

  describe('pages', () => {
    it('renders the map page shell on the server with a skeleton for the client-only map', async () => {
      const html = await $fetch<string>('/maps/seeded-site')
      expect(html).toContain('data-maps-view')
      expect(html).toContain('data-map-kind="maps.generic-geo"')
      expect(html).toContain('data-map-base="geo"')
      expect(html).toContain('data-feature-count="2"')
      expect(html).toContain('data-testid="maps-skeleton"')
      expect(html).toContain('Site map')
    })

    it('renders a module\'s own map page with nothing but <MapView>', async () => {
      const html = await $fetch<string>('/first-aid/first-aid-opr_seed', { headers: { cookie: staff.cookie } })
      expect(html).toContain('data-map-kind="first-aid"')
      expect(html).toContain('data-feature-count="1"')
    })

    it('asks anonymous visitors to sign in for a map that is not public', async () => {
      const html = await $fetch<string>('/maps/first-aid-opr_seed')
      expect(html).toContain('Sign in to see this map')
    })
  })
})
