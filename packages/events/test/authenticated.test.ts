import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { eventsApi } from '../src/runtime/utils/api'
import { eventId, getStripeCalls, makeEvent, postWebhook, registerUser, sendEvent } from './helpers'

type Session = Awaited<ReturnType<typeof registerUser>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

// The raw response of one call as `cookie` (or anonymously), whatever its status.
const json = (cookie: string | undefined, method: ApiMethod, path: string, body?: unknown) => apiClient({ cookie }).fetch(method, path, body)
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.json() as Promise<Json>
}

const future = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString()
let counter = 0

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

async function scopesFor(cookie: string) {
  const response = await fetch(authApi.scopes, { headers: { cookie } })
  expect(response.status).toBe(200)
  return (await response.json() as Array<{ name: string }>).map(scope => scope.name)
}

async function tokenStatus(cookie: string, scopes: string[]) {
  return (await json(cookie, 'POST', authApi.me.tokens, { name: 'probe', scopes })).status
}

async function mcpToken(cookie: string, scopes: string[]) {
  return (await ok(await json(cookie, 'POST', authApi.me.tokens, { name: 'MCP', scopes }))).token as string
}

describe('events (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: Session
  const user = async (name: string) => registerUser(name, `${name.toLowerCase()}${++counter}@example.com`)

  async function createEvent(overrides: Json = {}, ticketTypes: Json[] = []): Promise<Json> {
    staff ??= await registerUser('Staff', 'staff@staff.test')
    const slug = `event-${++counter}`
    return ok(await json(staff.cookie, 'POST', eventsApi.admin.events, {
      slug,
      name: { en: 'Summer party', da: 'Sommerfest' },
      startsAt: future(48),
      status: 'published',
      ticketTypes: ticketTypes.map((type, index) => ({ sortOrder: index, ...type })),
      ...overrides,
    }))
  }

  const detail = async (slug: string, cookie?: string) => ok(await json(cookie, 'GET', eventsApi.event(slug)))
  const buy = (cookie: string, slug: string, ticketTypeId: string, addonIds: string[] = []) =>
    json(cookie, 'POST', eventsApi.purchase(slug), { ticketTypeId, addonIds })

  const food = {
    title: { en: 'Food' },
    required: true,
    addons: [{ label: 'Meat', price: 5000 }, { label: 'Veggie', price: 4000 }, { label: 'None', price: 0 }],
  }

  describe('staff gate and catalogue', () => {
    it('denies by default: anonymous 401, non-staff 403', async () => {
      const nobody = await user('Nobody')
      expect((await json(undefined, 'GET', eventsApi.admin.events)).status).toBe(401)
      expect((await json(nobody.cookie, 'GET', eventsApi.admin.events)).status).toBe(403)
      expect((await json(nobody.cookie, 'POST', eventsApi.admin.checkIn, { code: 'x' })).status).toBe(403)
    })

    it('creates a nested catalogue and shows only published events publicly', async () => {
      const published = await createEvent({}, [{ key: 'default', name: 'Admission', price: 15000, isDefault: true, addonGroups: [food] }])
      const draft = await createEvent({ status: 'draft' })

      const list = await ok(await json(undefined, 'GET', eventsApi.list)) as unknown as Json[]
      expect(list.map(item => item.slug)).toContain(published.slug)
      expect(list.map(item => item.slug)).not.toContain(draft.slug)
      expect((await json(undefined, 'GET', eventsApi.event(draft.slug))).status).toBe(404)

      const shown = await detail(published.slug)
      expect(shown.ticketTypes).toHaveLength(1)
      expect(shown.ticketTypes[0]).toMatchObject({ key: 'default', price: 15000, saleState: 'open', remaining: null, blocked: null })
      expect(shown.ticketTypes[0].addonGroups[0].addons.map((addon: Json) => addon.price)).toEqual([5000, 4000, 0])
    })

    it('lists addon groups and their addons on the admin event, so staff can manage them', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 0, addonGroups: [food] }])
      const full = await ok(await json(staff.cookie, 'GET', eventsApi.admin.event(event.id)))
      const [group] = full.ticketTypes[0].addonGroups
      expect(group.addons.map((addon: Json) => addon.price)).toEqual([5000, 4000, 0])

      const created = await ok(await json(staff.cookie, 'POST', eventsApi.admin.addons(group.id), { label: 'Kids', price: 2500 }))
      const again = await ok(await json(staff.cookie, 'GET', eventsApi.admin.event(event.id)))
      expect(again.ticketTypes[0].addonGroups[0].addons.map((addon: Json) => addon.id)).toContain(created.id)
    })

    it('clones an event with its catalogue as a draft', async () => {
      const original = await createEvent({}, [{ key: 'default', name: 'Admission', price: 15000, isDefault: true, addonGroups: [food] }])
      const copy = await ok(await json(staff.cookie, 'POST', eventsApi.admin.clone(original.id)))
      expect(copy.id).not.toBe(original.id)
      expect(copy.slug).toBe(`${original.slug}-copy`)
      expect(copy.status).toBe('draft')

      const full = await ok(await json(staff.cookie, 'GET', eventsApi.admin.event(copy.id)))
      expect(full.ticketTypes).toHaveLength(1)
      expect(full.ticketTypes[0]).toMatchObject({ key: 'default', price: 15000 })
      const source = await ok(await json(staff.cookie, 'GET', eventsApi.admin.event(original.id)))
      expect(full.ticketTypes[0].id).not.toBe(source.ticketTypes[0].id)
      const shown = await ok(await json(staff.cookie, 'PATCH', eventsApi.admin.event(copy.id), { status: 'published' }))
      expect(shown.status).toBe('published')
      const pub = await detail(copy.slug)
      expect(pub.ticketTypes[0].addonGroups[0].addons.map((addon: Json) => addon.price)).toEqual([5000, 4000, 0])

      const again = await ok(await json(staff.cookie, 'POST', eventsApi.admin.clone(original.id)))
      expect(again.slug).toBe(`${original.slug}-copy-2`)
      expect((await json(staff.cookie, 'POST', eventsApi.admin.clone('nope'))).status).toBe(404)
      expect((await json(undefined, 'POST', eventsApi.admin.clone(original.id))).status).toBe(401)
    })

    it('applies a recurring sale season on top of the sale window', async () => {
      const season = (from: [number, number], to: [number, number]) => ({
        type: 'yearly', timezone: 'UTC', from: { month: from[0], day: from[1], time: '00:00' }, to: { month: to[0], day: to[1], time: '00:00' },
      })
      const today = new Date()
      const month = today.getUTCMonth() + 1
      // A season that surely covers now (the whole year but its last day) and one that surely does not (one day, 6 months away).
      const open = season([1, 1], [12, 31])
      const farMonth = ((month + 5) % 12) + 1
      const closed = season([farMonth, 10], [farMonth, 11])

      const event = await createEvent({}, [
        { key: 'in-season', name: 'In season', saleSchedule: open, isDefault: true },
        { key: 'off-season', name: 'Off season', saleSchedule: closed },
      ])
      const shown = await detail(event.slug)
      const byKey = Object.fromEntries(shown.ticketTypes.map((type: Json) => [type.key, type]))
      expect(byKey['off-season']).toMatchObject({ saleState: 'not_started' })
      expect(byKey['off-season'].saleStartsAt).toBeTruthy()
      if (!(month === 12 && today.getUTCDate() === 31)) expect(byKey['in-season'].saleState).toBe('open')

      const buyer = await user('Seasonal')
      expect((await buy(buyer.cookie, event.slug, byKey['off-season'].id)).status).toBe(409)

      const bad = await json(staff.cookie, 'POST', eventsApi.admin.ticketTypes(event.id), { key: 'bad', name: 'Bad', saleSchedule: { type: 'yearly', timezone: 'Nope/Land', from: { month: 1, day: 1, time: '00:00' }, to: { month: 2, day: 1, time: '00:00' } } })
      expect(bad.status).toBe(400)
    })

    it('rejects duplicate slugs', async () => {
      const first = await createEvent()
      const again = await json(staff.cookie, 'POST', eventsApi.admin.events, { slug: first.slug, name: 'x', startsAt: future(1) })
      expect(again.status).toBe(409)
    })
  })

  describe('catalogue edits', () => {
    it('edits and deletes ticket types, addon groups and addons, 404s on missing rows and parents', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 1000, addonGroups: [food] }, { key: 'vip', name: 'VIP', price: 5000 }])
      const full = await ok(await json(staff.cookie, 'GET', eventsApi.admin.event(event.id)))
      const [type, vip] = full.ticketTypes
      const group = type.addonGroups[0]
      const addon = group.addons[0]

      // Ticket types: PATCH answers the DTO, a taken key is a 409, a missing row a 404.
      const patchedType = await ok(await json(staff.cookie, 'PATCH', eventsApi.admin.ticketType(type.id), { price: 1200, capacity: 10 }))
      expect(patchedType).toMatchObject({ id: type.id, eventId: event.id, price: 1200, capacity: 10 })
      expect(typeof patchedType.createdAt).toBe('string')
      await expectApiError(json(staff.cookie, 'PATCH', eventsApi.admin.ticketType(vip.id), { key: 'default' }), 409, 'conflict')
      await expectApiError(json(staff.cookie, 'POST', eventsApi.admin.ticketTypes(event.id), { key: 'vip', name: 'Again' }), 409, 'conflict')
      await expectApiError(json(staff.cookie, 'PATCH', eventsApi.admin.ticketType('ttp_missing'), { price: 1 }), 404, 'not_found')
      await expectApiError(json(staff.cookie, 'POST', eventsApi.admin.ticketTypes('evn_missing'), { key: 'x', name: 'X' }), 404, 'not_found')

      // Addon groups.
      const patchedGroup = await ok(await json(staff.cookie, 'PATCH', eventsApi.admin.addonGroup(group.id), { multiple: true }))
      expect(patchedGroup).toMatchObject({ id: group.id, ticketTypeId: type.id, multiple: true, required: true })
      await expectApiError(json(staff.cookie, 'PATCH', eventsApi.admin.addonGroup('agr_missing'), { multiple: true }), 404, 'not_found')
      await expectApiError(json(staff.cookie, 'POST', eventsApi.admin.addonGroups('ttp_missing'), { title: 'X' }), 404, 'not_found')
      const createdGroup = await json(staff.cookie, 'POST', eventsApi.admin.addonGroups(vip.id), { title: 'Drinks', addons: [{ label: 'Wine', price: 100 }] })
      expect(createdGroup.status).toBe(201)

      // Addons.
      const patchedAddon = await ok(await json(staff.cookie, 'PATCH', eventsApi.admin.addon(addon.id), { price: 5500, capacity: 3 }))
      expect(patchedAddon).toMatchObject({ id: addon.id, groupId: group.id, price: 5500, capacity: 3 })
      await expectApiError(json(staff.cookie, 'PATCH', eventsApi.admin.addon('adn_missing'), { price: 1 }), 404, 'not_found')
      await expectApiError(json(staff.cookie, 'POST', eventsApi.admin.addons('agr_missing'), { label: 'X' }), 404, 'not_found')

      // Deletes answer 204, then 404 once the row is gone.
      expect((await json(staff.cookie, 'DELETE', eventsApi.admin.addon(addon.id))).status).toBe(204)
      await expectApiError(json(staff.cookie, 'DELETE', eventsApi.admin.addon(addon.id)), 404, 'not_found')
      expect((await json(staff.cookie, 'DELETE', eventsApi.admin.addonGroup(group.id))).status).toBe(204)
      await expectApiError(json(staff.cookie, 'DELETE', eventsApi.admin.addonGroup(group.id)), 404, 'not_found')
      expect((await json(staff.cookie, 'DELETE', eventsApi.admin.ticketType(vip.id))).status).toBe(204)
      await expectApiError(json(staff.cookie, 'DELETE', eventsApi.admin.ticketType(vip.id)), 404, 'not_found')

      const after = await ok(await json(staff.cookie, 'GET', eventsApi.admin.event(event.id)))
      expect(after.ticketTypes.map((item: Json) => item.key)).toEqual(['default'])
      expect(after.ticketTypes[0].addonGroups).toEqual([])
    })

    it('refuses to delete a ticket type with active tickets', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 0 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      await ok(await buy((await user('Holds')).cookie, event.slug, type.id))
      await expectApiError(json(staff.cookie, 'DELETE', eventsApi.admin.ticketType(type.id)), 409, 'conflict')
    })

    it('offers the subscription plans as membership options, to staff only', async () => {
      staff ??= await registerUser('Staff', 'staff@staff.test')
      const options = await ok(await json(staff.cookie, 'GET', eventsApi.admin.membershipOptions))
      expect(options.available).toBe(true)
      expect(options.options).toEqual(expect.arrayContaining([{ value: 'member', label: 'Member' }, { value: 'patron', label: 'Patron' }]))
      await expectApiError(json((await user('Outsider')).cookie, 'GET', eventsApi.admin.membershipOptions), 403, 'forbidden')
    })

    it('counts and lists the next published events for the dashboard', async () => {
      const soon = await createEvent({ startsAt: future(1), name: { en: 'Very soon' } })
      await createEvent({ status: 'draft', startsAt: future(1) })
      const upcoming = await ok(await json(staff.cookie, 'GET', eventsApi.admin.upcoming))
      expect(upcoming.total).toBeGreaterThan(0)
      expect(upcoming.items.length).toBeLessThanOrEqual(5)
      const item = upcoming.items.find((row: Json) => row.id === soon.id)
      expect(item).toEqual({ id: soon.id, name: { en: 'Very soon' }, location: null, startsAt: expect.any(String) })
      await expectApiError(json(undefined, 'GET', eventsApi.admin.upcoming), 401)
    })

    it('pages, searches and filters the staff event list', async () => {
      const marker = `pager${++counter}`
      const a = await createEvent({ slug: `${marker}-a`, name: { en: 'Pager A', da: 'Bladre Ø' }, startsAt: future(10) })
      const b = await createEvent({ slug: `${marker}-b`, name: { en: 'Pager B' }, startsAt: future(20), status: 'draft' })

      const all = await ok(await json(staff.cookie, 'GET', `${eventsApi.admin.events}?q=${marker}&sort=startsAt&order=asc`))
      expect(all).toMatchObject({ total: 2, page: 1, pageSize: 20 })
      expect(all.items.map((item: Json) => item.id)).toEqual([a.id, b.id])
      expect(all.items[0]).toMatchObject({ slug: a.slug, status: 'published', startsAt: expect.any(String), createdAt: expect.any(String) })

      const second = await ok(await json(staff.cookie, 'GET', `${eventsApi.admin.events}?q=${marker}&sort=startsAt&order=asc&pageSize=1&page=2`))
      expect(second).toMatchObject({ total: 2, page: 2, pageSize: 1 })
      expect(second.items.map((item: Json) => item.id)).toEqual([b.id])

      const drafts = await ok(await json(staff.cookie, 'GET', `${eventsApi.admin.events}?q=${marker}&status=draft`))
      expect(drafts.items.map((item: Json) => item.id)).toEqual([b.id])

      // Any language of the name matches.
      const byName = await ok(await json(staff.cookie, 'GET', `${eventsApi.admin.events}?q=${encodeURIComponent('bladre')}`))
      expect(byName.items.map((item: Json) => item.id)).toContain(a.id)
      // Locale keys are not text: `en` matches neither "Pager A", "Bladre Ø" nor the slug.
      const byKey = await ok(await json(staff.cookie, 'GET', `${eventsApi.admin.events}?q=en&pageSize=100`))
      expect(byKey.items.map((item: Json) => item.id)).not.toContain(a.id)

      await expectApiError(json(staff.cookie, 'GET', `${eventsApi.admin.events}?pageSize=500`), 400)
      await expectApiError(json(staff.cookie, 'GET', `${eventsApi.admin.events}?status=nope`), 400)
    })

    it('searches attendees by holder name and email', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 0 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const [alice, bob] = [await user('Alicesearch'), await user('Bobsearch')]
      await ok(await buy(alice.cookie, event.slug, type.id))
      await ok(await buy(bob.cookie, event.slug, type.id))

      const found = await ok(await json(staff.cookie, 'GET', `${eventsApi.admin.attendees(event.id)}?q=alicesearch`))
      expect(found.total).toBe(1)
      expect(found.items[0].userName).toBe('Alicesearch')
      const page = await ok(await json(staff.cookie, 'GET', `${eventsApi.admin.attendees(event.id)}?pageSize=1&sort=name&order=asc`))
      expect(page).toMatchObject({ total: 2, pageSize: 1 })
      expect(page.items[0].userName).toBe('Alicesearch')
    })
  })

  describe('purchase', () => {
    it('issues a free ticket immediately without touching Stripe', async () => {
      const event = await createEvent({}, [{ key: 'free', name: 'Free entry' }])
      const buyer = await user('Free')
      await getStripeCalls(true)

      const result = await ok(await buy(buyer.cookie, event.slug, (await detail(event.slug)).ticketTypes[0].id))
      expect(result.url).toBeUndefined()
      expect(result.ticket).toMatchObject({ status: 'paid', amount: 0 })
      expect(result.ticket.code).toBeTruthy()
      expect((await getStripeCalls()).some(call => call.path === '/v1/checkout/sessions')).toBe(false)
    })

    it('keeps translated texts (location included) and the buyer language', async () => {
      const event = await createEvent(
        { location: { da: 'Haven', en: 'The garden', de: '' }, body: { en: 'Details' } },
        [{ key: 'free', name: { en: 'Free entry', da: 'Gratis' } }],
      )
      const shown = await detail(event.slug)
      // Empty languages are dropped; a plain location string (older rows) still reads as a string.
      expect(shown.location).toEqual({ da: 'Haven', en: 'The garden' })
      const plain = await createEvent({ location: 'Plain street 1' })
      expect((await detail(plain.slug)).location).toBe('Plain street 1')
      expect((await json(staff.cookie, 'POST', eventsApi.admin.events, { slug: 'blank-name', name: { en: ' ' }, startsAt: future(48) })).status).toBe(400)

      const buyer = await user('Lang')
      const result = await ok(await json(buyer.cookie, 'POST', eventsApi.purchase(event.slug), { ticketTypeId: shown.ticketTypes[0].id, locale: 'da' }))
      expect(result.ticket.locale).toBe('da')
      expect((await json(buyer.cookie, 'POST', eventsApi.purchase(event.slug), { ticketTypeId: shown.ticketTypes[0].id, locale: '<script>' })).status).toBe(400)
    })

    it('charges ticket + addon through payments, and only turns paid on the Stripe event', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 15000, addonGroups: [food] }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const meat = type.addonGroups[0].addons[0]
      const buyer = await user('Pays')
      await getStripeCalls(true)

      const result = await ok(await buy(buyer.cookie, event.slug, type.id, [meat.id]))
      expect(result.url).toMatch(/^https:\/\/checkout\.stripe\.test\//)
      expect(result.ticket).toMatchObject({ status: 'pending', amount: 20000, code: null })

      const session = (await getStripeCalls()).find(call => call.path === '/v1/checkout/sessions')!
      expect(session.params).toMatchObject({
        'mode': 'payment',
        'line_items[0][price_data][unit_amount]': '15000',
        'line_items[1][price_data][unit_amount]': '5000',
        'line_items[1][price_data][product_data][name]': 'Meat',
        'success_url': expect.stringContaining(`/events/${event.slug}?ticket=${result.ticket.id}&payment=success`),
      })

      // The browser redirect alone changes nothing.
      expect((await ok(await json(buyer.cookie, 'GET', eventsApi.me.ticket(result.ticket.id)))).status).toBe('pending')

      const payment = (await $fetch<Json[]>('/api/test/payments')).find(row => row.id === result.ticket.paymentId)!
      await sendEvent('ticket_paid', 'checkout.session.completed', { id: payment.checkoutSessionId, payment_status: 'paid', payment_intent: `pi_${result.ticket.id}` })

      const paid = await ok(await json(buyer.cookie, 'GET', eventsApi.me.ticket(result.ticket.id)))
      expect(paid).toMatchObject({ status: 'paid', amount: 20000 })
      expect(paid.code).toBeTruthy()
      expect(paid.addons).toMatchObject([{ label: 'Meat', price: 5000 }])
    })

    it('validates addon choices', async () => {
      const event = await createEvent({}, [
        { key: 'a', name: 'A', price: 1000, addonGroups: [food] },
        { key: 'b', name: 'B', price: 1000, addonGroups: [{ title: 'Other', addons: [{ label: 'Z', price: 1 }] }] },
      ])
      const [a, b] = (await detail(event.slug)).ticketTypes
      const buyer = await user('Picky')

      expect((await buy(buyer.cookie, event.slug, a.id)).status).toBe(400) // required group missing
      expect((await buy(buyer.cookie, event.slug, a.id, [b.addonGroups[0].addons[0].id])).status).toBe(400) // foreign addon
      expect((await buy(buyer.cookie, event.slug, a.id, [a.addonGroups[0].addons[0].id, a.addonGroups[0].addons[1].id])).status).toBe(400) // two in single-choice group
      expect((await buy(buyer.cookie, event.slug, 'ttp_unknown')).status).toBe(404)
      expect((await buy(undefined as unknown as string, event.slug, a.id)).status).toBe(401)
    })

    it('enforces the per-user limit and the sale window', async () => {
      const event = await createEvent({}, [
        { key: 'open', name: 'Open', price: 0 },
        { key: 'later', name: 'Later', price: 0, saleStartsAt: future(5) },
        { key: 'over', name: 'Over', price: 0, saleEndsAt: new Date(Date.now() - 3600_000).toISOString() },
      ])
      const [open, later, over] = (await detail(event.slug)).ticketTypes
      const buyer = await user('Limit')

      await ok(await buy(buyer.cookie, event.slug, open.id))
      expect((await buy(buyer.cookie, event.slug, open.id)).status).toBe(409)
      expect((await buy(buyer.cookie, event.slug, later.id)).status).toBe(409)
      expect((await buy(buyer.cookie, event.slug, over.id)).status).toBe(409)

      const after = await detail(event.slug, buyer.cookie)
      expect(after.ticketTypes.map((type: Json) => [type.key, type.saleState, type.blocked])).toEqual([
        ['open', 'open', 'limit_reached'],
        ['later', 'not_started', null],
        ['over', 'ended', null],
      ])
    })
  })

  describe('capacity', () => {
    it('sells out, and frees the seat when an unpaid reservation expires', async () => {
      const event = await createEvent({}, [{ key: 'tiny', name: 'Tiny', price: 1000, capacity: 1, addonGroups: [] }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const [first, second, third] = [await user('One'), await user('Two'), await user('Three')]

      const held = await ok(await buy(first.cookie, event.slug, type.id))
      expect((await buy(second.cookie, event.slug, type.id)).status).toBe(409)
      expect((await detail(event.slug)).ticketTypes[0]).toMatchObject({ remaining: 0, saleState: 'sold_out' })

      const payment = (await $fetch<Json[]>('/api/test/payments')).find(row => row.id === held.ticket.paymentId)!
      await sendEvent('cap_expired', 'checkout.session.expired', { id: payment.checkoutSessionId })
      expect((await $fetch<Json[]>('/api/test/tickets')).find(row => row.id === held.ticket.id)!.status).toBe('expired')

      await ok(await buy(third.cookie, event.slug, type.id))
    })

    it('stops counting an unpaid reservation once its window has passed', async () => {
      const event = await createEvent({}, [{ key: 'tiny', name: 'Tiny', price: 1000, capacity: 1 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const slow = await user('Slow')
      const quick = await user('Quick')

      const held = await ok(await buy(slow.cookie, event.slug, type.id))
      await $fetch('/api/test/set-ticket-created', { method: 'POST', body: { id: held.ticket.id, minutesAgo: 45 } })
      await ok(await buy(quick.cookie, event.slug, type.id))
    })

    it('never oversells when buyers race for the last seats', async () => {
      const event = await createEvent({}, [{ key: 'race', name: 'Race', price: 0, capacity: 2 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const buyers = await Promise.all(Array.from({ length: 6 }, (_, index) => user(`Racer${index}`)))

      const statuses = (await Promise.all(buyers.map(buyer => buy(buyer.cookie, event.slug, type.id)))).map(response => response.status)
      expect(statuses.filter(status => status === 200)).toHaveLength(2)
      expect(statuses.filter(status => status === 409)).toHaveLength(4)
      const held = (await $fetch<Json[]>('/api/test/tickets')).filter(row => row.ticketTypeId === type.id && row.status === 'paid')
      expect(held).toHaveLength(2)
    })

    it('caps addons independently of the ticket', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 0, addonGroups: [{ title: 'Dinner', addons: [{ label: 'Last supper', price: 100, capacity: 1 }] }] }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const addon = type.addonGroups[0].addons[0]
      const [a, b] = [await user('A'), await user('B')]

      await ok(await buy(a.cookie, event.slug, type.id, [addon.id]))
      expect((await buy(b.cookie, event.slug, type.id, [addon.id])).status).toBe(409)
      expect((await detail(event.slug)).ticketTypes[0].addonGroups[0].addons[0].soldOut).toBe(true)
      await ok(await buy(b.cookie, event.slug, type.id)) // the ticket itself is still available
    })
  })

  describe('membership requirements', () => {
    it('gates on an active subscription at event and ticket level, and unlocks after the Stripe event', async () => {
      const gated = await createEvent({ requiresMembership: 'any' }, [{ key: 'default', name: 'Members', price: 0 }])
      const planGated = await createEvent({}, [{ key: 'patrons', name: 'Patrons', price: 0, requiresMembership: ['patron'] }])
      const buyer = await user('Member')

      const type = (await detail(gated.slug, buyer.cookie)).ticketTypes[0]
      expect(type.blocked).toBe('membership_required')
      expect((await buy(buyer.cookie, gated.slug, type.id)).status).toBe(403)

      const subscription = (priceId: string, id: string) => ({
        object: 'subscription', id, customer: buyer.customerId, status: 'active', cancel_at_period_end: false, ended_at: null, canceled_at: null,
        items: { object: 'list', data: [{ id: `si_${id}`, quantity: 1, current_period_start: 1700000000, current_period_end: 1999999999, price: { id: priceId, lookup_key: null } }] },
      })
      const response = await postWebhook(makeEvent(eventId('member_sub'), 'customer.subscription.created', subscription('price_member_m', 'sub_member')))
      expect(response.status).toBe(200)

      expect((await detail(gated.slug, buyer.cookie)).ticketTypes[0].blocked).toBeNull()
      await ok(await buy(buyer.cookie, gated.slug, type.id))

      // A "member" plan does not satisfy a ticket that needs "patron".
      const patrons = (await detail(planGated.slug, buyer.cookie)).ticketTypes[0]
      expect((await buy(buyer.cookie, planGated.slug, patrons.id)).status).toBe(403)
    })
  })

  describe('membership exclusions', () => {
    it('keeps holders of the excluded plans from buying, so members and non-members get separate ticket types', async () => {
      const event = await createEvent({}, [
        { key: 'members', name: 'Member price', price: 0, requiresMembership: 'any' },
        { key: 'guests', name: 'Guest price', price: 0, excludesMembership: 'any' },
        { key: 'not-patrons', name: 'Not for patrons', price: 0, excludesMembership: ['patron'] },
      ])
      const guest = await user('Guest')
      const member = await user('Member')

      const subscription = {
        object: 'subscription', id: 'sub_excl', customer: member.customerId, status: 'active', cancel_at_period_end: false, ended_at: null, canceled_at: null,
        items: { object: 'list', data: [{ id: 'si_excl', quantity: 1, current_period_start: 1700000000, current_period_end: 1999999999, price: { id: 'price_member_m', lookup_key: null } }] },
      }
      expect((await postWebhook(makeEvent(eventId('excl_sub'), 'customer.subscription.created', subscription))).status).toBe(200)

      const byKey = async (cookie: string) => Object.fromEntries((await detail(event.slug, cookie)).ticketTypes.map((type: { key: string }) => [type.key, type]))
      const asGuest = await byKey(guest.cookie)
      const asMember = await byKey(member.cookie)

      // A guest may buy the guest price but not the member price.
      expect(asGuest.guests.blocked).toBeNull()
      expect(asGuest.guests.excludesMembership).toBe('any')
      expect(asGuest.members.blocked).toBe('membership_required')
      expect((await buy(guest.cookie, event.slug, asGuest.guests.id)).status).toBe(200)

      // A member is excluded from the guest price, and may buy the member price.
      expect(asMember.guests.blocked).toBe('membership_excluded')
      expect((await buy(member.cookie, event.slug, asMember.guests.id)).status).toBe(403)
      expect(asMember.members.blocked).toBeNull()
      await ok(await buy(member.cookie, event.slug, asMember.members.id))

      // Excluding a plan the member does not hold does not affect them.
      expect(asMember['not-patrons'].blocked).toBeNull()
    })
  })

  describe('payment lifecycle', () => {
    it('marks the ticket refunded from charge.refunded and frees it for entry checks', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 9000 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const buyer = await user('Refunded')
      const bought = await ok(await buy(buyer.cookie, event.slug, type.id))
      const payment = (await $fetch<Json[]>('/api/test/payments')).find(row => row.id === bought.ticket.paymentId)!
      await sendEvent('refund_paid', 'checkout.session.completed', { id: payment.checkoutSessionId, payment_status: 'paid', payment_intent: 'pi_refund' })
      const code = (await ok(await json(buyer.cookie, 'GET', eventsApi.me.ticket(bought.ticket.id)))).code

      await getStripeCalls(true)
      await ok(await json(staff.cookie, 'POST', eventsApi.admin.refundTicket(bought.ticket.id)))
      expect((await getStripeCalls()).find(call => call.path === '/v1/refunds')!.params).toMatchObject({ payment_intent: 'pi_refund' })
      // Not refunded until Stripe confirms.
      expect((await $fetch<Json[]>('/api/test/tickets')).find(row => row.id === bought.ticket.id)!.status).toBe('paid')

      await sendEvent('refund_done', 'charge.refunded', { payment_intent: 'pi_refund', amount: 9000, amount_refunded: 9000 })
      expect((await $fetch<Json[]>('/api/test/tickets')).find(row => row.id === bought.ticket.id)!.status).toBe('refunded')
      expect((await json(staff.cookie, 'POST', eventsApi.admin.checkIn, { code })).status).toBe(409)
    })

    it('keeps the ticket valid on a partial refund', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 9000 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const buyer = await user('Partial')
      const bought = await ok(await buy(buyer.cookie, event.slug, type.id))
      const payment = (await $fetch<Json[]>('/api/test/payments')).find(row => row.id === bought.ticket.paymentId)!
      await sendEvent('part_paid', 'checkout.session.completed', { id: payment.checkoutSessionId, payment_status: 'paid', payment_intent: 'pi_partial' })
      await sendEvent('part_refund', 'charge.refunded', { payment_intent: 'pi_partial', amount: 9000, amount_refunded: 1000 })
      expect((await $fetch<Json[]>('/api/test/tickets')).find(row => row.id === bought.ticket.id)!.status).toBe('paid')
    })

    it('resumes an unpaid ticket, but not a paid one, and cancels free tickets only through staff', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 3000 }, { key: 'free', name: 'Free', price: 0 }])
      const [paidType, freeType] = (await detail(event.slug)).ticketTypes
      const buyer = await user('Resume')
      const pending = await ok(await buy(buyer.cookie, event.slug, paidType.id))
      const again = await ok(await json(buyer.cookie, 'POST', eventsApi.me.pay(pending.ticket.id)))
      expect(again.url).toBe(pending.url)

      const free = await ok(await buy(buyer.cookie, event.slug, freeType.id))
      expect((await json(buyer.cookie, 'POST', eventsApi.me.pay(free.ticket.id))).status).toBe(409)
      await ok(await json(staff.cookie, 'POST', eventsApi.admin.cancelTicket(free.ticket.id)))
      expect((await json(staff.cookie, 'POST', eventsApi.admin.refundTicket(pending.ticket.id))).status).toBe(409)
    })
  })

  describe('check-in', () => {
    it('validates a paid ticket once, reports repeats, and rejects unpaid and unknown codes', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 0 }, { key: 'paid', name: 'Paid', price: 1000 }])
      const [free, paidType] = (await detail(event.slug)).ticketTypes
      const guest = await user('Guest')
      const ticket = (await ok(await buy(guest.cookie, event.slug, free.id))).ticket
      const unpaid = (await ok(await buy(guest.cookie, event.slug, paidType.id))).ticket

      expect(eventsApi.admin.checkIn).toBe('/api/admin/events/check-in')
      const first = await ok(await json(staff.cookie, 'POST', eventsApi.admin.checkIn, { code: ticket.code }))
      expect(first).toMatchObject({ ok: true, alreadyCheckedIn: false })
      expect(first.ticket.code).toBeNull() // scanners never get the code echoed back

      const second = await ok(await json(staff.cookie, 'POST', eventsApi.admin.checkIn, { code: ticket.code }))
      expect(second).toMatchObject({ alreadyCheckedIn: true, checkedInAt: first.checkedInAt })

      const unpaidCode = (await $fetch<Json[]>('/api/test/tickets')).find(row => row.id === unpaid.id)!.code
      expect((await json(staff.cookie, 'POST', eventsApi.admin.checkIn, { code: unpaidCode })).status).toBe(409)
      expect((await json(staff.cookie, 'POST', eventsApi.admin.checkIn, { code: 'nope' })).status).toBe(404)
      expect((await json(guest.cookie, 'POST', eventsApi.admin.checkIn, { code: ticket.code })).status).toBe(403)
    })

    it('lists attendees for staff and refuses to delete events with paid tickets', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 0 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const guest = await user('Attendee')
      await ok(await buy(guest.cookie, event.slug, type.id))

      const attendees = await ok(await json(staff.cookie, 'GET', eventsApi.admin.attendees(event.id)))
      expect(attendees).toMatchObject({ total: 1, page: 1, pageSize: 50 })
      expect(attendees.items[0]).toMatchObject({ userEmail: expect.stringContaining('attendee'), status: 'paid', code: expect.any(String) })
      // An allowlisted DTO: internal columns like `checkedInBy` and `updatedAt` stay out.
      expect(attendees.items[0]).not.toHaveProperty('checkedInBy')
      expect(attendees.items[0]).not.toHaveProperty('updatedAt')
      await expectApiError(json(staff.cookie, 'DELETE', eventsApi.admin.event(event.id)), 409, 'conflict')

      const empty = await createEvent()
      expect((await json(staff.cookie, 'DELETE', eventsApi.admin.event(empty.id))).status).toBe(204)
      await expectApiError(json(staff.cookie, 'DELETE', eventsApi.admin.event(empty.id)), 404, 'not_found')
      await expectApiError(json(staff.cookie, 'GET', eventsApi.admin.attendees('evn_missing')), 404, 'not_found')
    })
  })

  describe('my tickets', () => {
    it('lists only my tickets', async () => {
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 0, maxPerUser: 3 }])
      const type = (await detail(event.slug)).ticketTypes[0]
      const [me, other] = [await user('Me'), await user('Other')]
      await ok(await buy(me.cookie, event.slug, type.id))
      await ok(await buy(other.cookie, event.slug, type.id))

      const mine = await ok(await json(me.cookie, 'GET', eventsApi.me.tickets)) as unknown as Json[]
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatchObject({ eventSlug: event.slug, status: 'paid' })
      expect((await json(me.cookie, 'GET', eventsApi.me.ticket((await ok(await json(other.cookie, 'GET', eventsApi.me.tickets)) as unknown as Json[])[0]!.id))).status).toBe(404)
    })
  })

  describe('pages', () => {
    it('renders the public list and detail with links to the event', async () => {
      const event = await createEvent({ name: { en: 'Page smoke party' } }, [{ key: 'default', name: 'Admission', price: 0 }])

      const list = await fetch('/events')
      expect(list.status).toBe(200)
      const listHtml = await list.text()
      expect(listHtml).toContain('Page smoke party')
      expect(listHtml).toContain(`href="/events/${event.slug}"`)

      const page = await fetch(`/events/${event.slug}`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('Page smoke party')
    }, 180_000)

    it('renders the staff list and event page', async () => {
      const event = await createEvent({ name: { en: 'Staff smoke party' } })
      const list = await fetch('/admin/events', { headers: { cookie: staff.cookie } })
      expect(list.status).toBe(200)
      expect(await list.text()).toContain('Staff smoke party')

      const page = await fetch(`/admin/events/${event.id}`, { headers: { cookie: staff.cookie } })
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('Staff smoke party')
    }, 180_000)

    it('renders my tickets on the server, and the empty state only without tickets', async () => {
      const event = await createEvent({ name: { en: 'Ticket page party' } }, [{ key: 'default', name: 'Admission', price: 0 }])
      const [holder, newcomer] = [await user('Holder'), await user('Newcomer')]
      await ok(await buy(holder.cookie, event.slug, (await detail(event.slug)).ticketTypes[0].id))

      const page = await fetch('/account/tickets', { headers: { cookie: holder.cookie } })
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('Ticket page party')
      expect(html).not.toContain('No tickets yet')

      const empty = await fetch('/account/tickets', { headers: { cookie: newcomer.cookie } })
      expect(empty.status).toBe(200)
      expect(await empty.text()).toContain('No tickets yet')
    }, 180_000)
  })

  describe('API tokens', () => {
    const createToken = async (cookie: string, scopes: string[]) =>
      (await ok(await json(cookie, 'POST', authApi.me.tokens, { name: 'test', scopes }))).token as string
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

    it('lets a token read tickets with the scope, and refuses without it', async () => {
      const me = await user('Tokenuser')
      const read = await createToken(me.cookie, ['tickets:read'])
      expect((await fetch(eventsApi.me.tickets, { headers: bearer(read) })).status).toBe(200)

      const other = await createToken(me.cookie, ['tickets:write'])
      expect((await fetch(eventsApi.me.tickets, { headers: bearer(other) })).status).toBe(403)
      expect((await fetch(eventsApi.me.tickets, { headers: bearer('fnu_invalid') })).status).toBe(401)
    })

    it('lets a staff token manage events and check in, but never refund (money needs a session)', async () => {
      staff ??= await registerUser('Staff', 'staff@staff.test')
      const event = await createEvent({}, [{ key: 'default', name: 'Admission', price: 9000 }, { key: 'free', name: 'Free', price: 0 }])
      const [paidType, freeType] = (await detail(event.slug)).ticketTypes
      const buyer = await user('Bearerrefund')
      const bought = await ok(await buy(buyer.cookie, event.slug, paidType.id))
      const payment = (await $fetch<Json[]>('/api/test/payments')).find(row => row.id === bought.ticket.paymentId)!
      await sendEvent('bearer_refund_paid', 'checkout.session.completed', { id: payment.checkoutSessionId, payment_status: 'paid', payment_intent: 'pi_bearer_refund' })
      const free = (await ok(await buy(buyer.cookie, event.slug, freeType.id))).ticket

      const api = apiClient({ bearer: await createToken(staff.cookie, ['events:manage']) })
      expect((await api.json<Json>('GET', eventsApi.admin.event(event.id))).id).toBe(event.id)
      expect((await api.json<Json>('POST', eventsApi.admin.checkIn, { code: free.code })).alreadyCheckedIn).toBe(false)
      await expectApiError(api.json('POST', eventsApi.admin.refundTicket(bought.ticket.id)), 403, 'session_required')
      expect((await $fetch<Json[]>('/api/test/tickets')).find(row => row.id === bought.ticket.id)!.status).toBe('paid')
    })

    it('keeps the staff policy in charge: the scope is necessary, not sufficient', async () => {
      staff ??= await registerUser('Staff', 'staff@staff.test')
      const nobody = await user('Nobody')

      const staffToken = await createToken(staff.cookie, ['events:manage'])
      expect((await fetch(eventsApi.admin.events, { headers: bearer(staffToken) })).status).toBe(200)
      expect((await fetch(eventsApi.admin.events, { headers: bearer(await createToken(staff.cookie, ['tickets:read'])) })).status).toBe(403)
      // Staff scopes are not even offered to, or accepted from, users the policy keeps out.
      expect(await scopesFor(nobody.cookie)).not.toEqual(expect.arrayContaining(['events:manage']))
      expect(await scopesFor(nobody.cookie)).toContain('tickets:read')
      expect(await scopesFor(staff.cookie)).toEqual(expect.arrayContaining(['events:manage', 'events:pii']))
      expect(await tokenStatus(nobody.cookie, ['events:manage'])).toBe(400)
    })
  })

  describe('MCP tools', () => {
    it('shows staff tools only to staff with the scope, and PII only with events:pii', async () => {
      const staff = await registerUser('McpStaff', 'mcp-staff@staff.test')
      const guest = await registerUser('Guest', 'mcp-guest@example.com')

      expect(await tokenStatus(guest.cookie, ['events:manage'])).toBe(400)
      expect(await tokenStatus(guest.cookie, ['events:pii'])).toBe(400)
      const guestAll = await mcpToken(guest.cookie, ['tickets:read'])
      expect(await mcpNames(guestAll)).toEqual(['get-event', 'list-events', 'my-tickets'])

      const staffRead = await mcpToken(staff.cookie, ['tickets:read'])
      expect(await mcpNames(staffRead)).toEqual(['get-event', 'list-events', 'my-tickets'])

      const staffFull = await mcpToken(staff.cookie, ['*'])
      expect(await mcpNames(staffFull)).toContain('list-all-events')

      const staffManage = await mcpToken(staff.cookie, ['events:manage'])
      expect(await mcpNames(staffManage)).toEqual(['create-event', 'get-event-definition', 'list-all-events', 'list-attendees', 'update-event', 'update-ticket-type'])

      const created = await mcpCall(staffManage, 'create-event', { slug: 'mcp-party', name: 'MCP party', startsAt: future(48), status: 'published' })
      expect(created.result?.isError, JSON.stringify(created)).toBeFalsy()

      const createdEvent = JSON.parse(created.result!.content[0].text) as { id: string }
      const withTypes = await mcpCall(staffManage, 'create-event', {
        slug: 'mcp-tickets', name: 'MCP tickets', startsAt: future(48), status: 'draft',
        ticketTypes: [
          { key: 'general', name: 'General', price: 100, capacity: 50, addonGroups: [{ title: 'Food', addons: [{ label: 'Meat', price: 52.2 }] }] },
          { key: 'yen', name: 'Yen', price: 500, currency: 'jpy' },
        ],
      })
      expect(withTypes.result?.isError, JSON.stringify(withTypes)).toBeFalsy()
      const withTypesId = (JSON.parse(withTypes.result!.content[0].text) as { id: string }).id
      expect(createdEvent.id).toBeTruthy()

      const definition = await mcpCall(staffManage, 'get-event-definition', { id: withTypesId })
      const types = (JSON.parse(definition.result!.content[0].text) as { ticketTypes: Array<{ id: string, key: string, price: number, currency: string, addonGroups: Array<{ addons: Array<{ price: number }> }> }> }).ticketTypes
      const ticketType = types.find(type => type.key === 'general')
      const yenType = types.find(type => type.key === 'yen')
      // Whole units in and out; the database keeps minor units (and no decimals for JPY).
      expect(ticketType).toMatchObject({ price: 100, currency: 'DKK' })
      expect(ticketType?.addonGroups[0]?.addons[0]?.price).toBe(52.2)
      expect(yenType).toMatchObject({ price: 500, currency: 'JPY' })
      const stored = await ok(await json(staff.cookie, 'GET', eventsApi.admin.event(withTypesId)))
      expect(stored.ticketTypes.find((type: Json) => type.key === 'general')).toMatchObject({ price: 10000 })
      expect(stored.ticketTypes.find((type: Json) => type.key === 'yen')).toMatchObject({ price: 500 })
      const updatedType = await mcpCall(staffManage, 'update-ticket-type', { id: ticketType!.id, patch: { price: 150.5, capacity: 20, saleEndsAt: future(24) } })
      expect(updatedType.result?.isError, JSON.stringify(updatedType)).toBeFalsy()
      expect(JSON.parse(updatedType.result!.content[0].text)).toMatchObject({ id: ticketType!.id, price: 150.5, capacity: 20 })
      expect((await mcpCall(staffManage, 'update-ticket-type', { id: 'nope', patch: { price: 1 } })).result?.isError).toBe(true)
      expect((await mcpCall(guestAll, 'update-ticket-type', { id: ticketType!.id, patch: { price: 1 } })).result?.isError ?? true).toBeTruthy()

      // Direct calls to hidden tools are refused rather than trusting the listing.
      const denied = await mcpCall(guestAll, 'list-all-events')
      expect(denied.result?.isError ?? denied.error).toBeTruthy()

      const eventsAsGuest = await mcpCall(guestAll, 'list-events')
      expect(JSON.stringify(eventsAsGuest)).toContain('mcp-party')

      const attendees = await mcpCall(staffManage, 'list-attendees', { eventId: 'does-not-matter' })
      expect(attendees.result?.isError).toBeFalsy()
      expect(JSON.stringify(attendees)).not.toMatch(/"code"|userEmail/)
    })
  })
})
