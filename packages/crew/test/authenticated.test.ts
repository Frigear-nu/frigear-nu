import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { formsApi } from '@frigear-nu/forms/api'
import { operationsApi } from '@frigear-nu/operations/api'
import { teamsApi } from '@frigear-nu/teams/api'
import { crewApi } from '../src/runtime/utils/api'
import { crewAccess } from '../src/runtime/access'
import { getEmailsTo, getHooksOf, getViewer, registerUser } from './helpers'

type Session = Awaited<ReturnType<typeof registerUser>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const json = (cookie: string | undefined, method: ApiMethod, path: string, body?: unknown) => apiClient({ cookie }).fetch(method, path, body)
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.status === 204 ? {} as Json : response.json() as Promise<Json>
}

let counter = 0

async function createToken(cookie: string, scopes: string[]) {
  const response = await fetch(authApi.me.tokens, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'test', scopes }),
  })
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return (await response.json() as { token: string }).token
}

const FORM_DEFINITION = {
  mode: 'single',
  storage: 'db',
  access: { availability: 'web', auth: 'user' },
  steps: [{
    id: 'about',
    fields: [
      { key: 'name', type: 'text', required: true, label: 'Name' },
      { key: 'phone', type: 'tel', label: 'Phone' },
      { key: 'motivation', type: 'textarea', label: 'Why do you want to join?' },
    ],
  }],
}

describe('crew (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 240_000, setupTimeout: 300_000 })

  let staff: Session
  const user = (name: string, domain = 'example.com') => registerUser(name, `${name.toLowerCase()}${++counter}@${domain}`)

  beforeAll(async () => {
    staff = await registerUser('Staff', 'staff@staff.test')
  })

  const createOperation = async (overrides: Json = {}): Promise<Json> => ok(await json(staff.cookie, 'POST', operationsApi.admin.operations, {
    slug: `operation-${++counter}`,
    name: { en: `Operation ${counter}` },
    startsAt: '2027-06-27T10:00:00.000Z',
    ...overrides,
  }))
  const createForm = async (definition: Json = FORM_DEFINITION): Promise<Json> => ok(await json(staff.cookie, 'POST', formsApi.admin.forms, {
    slug: `crew-form-${++counter}`,
    name: `Crew form ${counter}`,
    status: 'published',
    definition,
  }))
  const saveSettings = (operationId: string, body: Json) => json(staff.cookie, 'PUT', crewApi.admin.settings(operationId), body)

  type Crew = { op: Json, form: Json, settings: Json, teamId: string }
  /** An operation with an application form and crew settings. */
  async function newCrew(settings: Json = {}, operation: Json = {}): Promise<Crew> {
    const op = await createOperation(operation)
    const form = await createForm()
    const saved = await ok(await saveSettings(op.id, { formId: form.id, ...settings }))
    return { op, form, settings: saved, teamId: saved.defaultTeamId as string }
  }
  const createTeam = async (crew: Crew, name = `Bar ${++counter}`): Promise<Json> => ok(await json(staff.cookie, 'POST', teamsApi.admin.teams, {
    ownerType: 'operation',
    ownerId: crew.op.id,
    kind: 'bar',
    name,
  }))

  const apply = (who: Session, crew: Crew, answers: Json = {}) =>
    json(who.cookie, 'POST', formsApi.submit(crew.form.slug), { answers: { name: who.email, ...answers }, locale: 'en' })
  const list = async (cookie: string, crew: Crew, query = ''): Promise<Json> => ok(await json(cookie, 'GET', `${crewApi.admin.members(crew.op.id)}?pageSize=100${query}`))
  const rowOf = async (crew: Crew, who: Session, cookie = staff.cookie): Promise<Json> => {
    const row = (await list(cookie, crew)).items.find((item: Json) => item.userId === who.id)
    expect(row, `${who.email} is in the crew`).toBeDefined()
    return row
  }
  const applied = async (who: Session, crew: Crew, answers: Json = {}): Promise<Json> => {
    await ok(await apply(who, crew, answers))
    return rowOf(crew, who)
  }
  const approve = async (row: Json, body: Json = {}): Promise<Json> => ok(await json(staff.cookie, 'POST', crewApi.admin.approve(row.id), body))
  const reject = async (row: Json): Promise<Json> => ok(await json(staff.cookie, 'POST', crewApi.admin.reject(row.id)))
  const myTeams = async (cookie: string) => ok(await json(cookie, 'GET', teamsApi.me.teams)) as unknown as Promise<Json[]>
  const myOperations = async (cookie: string) => ok(await json(cookie, 'GET', operationsApi.me.operations)) as unknown as Promise<Json[]>
  const hookNames = async (who: Session) => (await getHooksOf(who.id)).map(entry => entry.name)

  describe('settings', () => {
    it('answers defaults before the first save, then creates the default team and the presets once', async () => {
      const op = await createOperation()
      const form = await createForm()
      expect(await ok(await json(staff.cookie, 'GET', crewApi.admin.settings(op.id)))).toMatchObject({ source: 'default', formId: null, capacity: null, waitlist: true, presets: true, approved: 0 })

      const saved = await ok(await saveSettings(op.id, { formId: form.id, capacity: 5 }))
      expect(saved).toMatchObject({ source: 'stored', formId: form.id, capacity: 5, waitlist: true, previousCrewFirst: false })
      expect(saved.defaultTeamId).toBeTruthy()

      const teams = await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.teams}?ownerType=operation&ownerId=${op.id}`))
      expect(teams.items).toHaveLength(1)
      expect(teams.items[0]).toMatchObject({ id: saved.defaultTeamId, kind: 'bar', name: { en: 'Crew' }, ownerType: 'operation', ownerId: op.id })

      // Saving again neither adds a team nor the presets twice.
      await ok(await saveSettings(op.id, { formId: form.id, capacity: 6 }))
      expect((await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.teams}?ownerType=operation&ownerId=${op.id}`))).items).toHaveLength(1)
      const rules = await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.mappings}?ownerType=operation&ownerId=${op.id}`)) as unknown as Json[]
      expect(rules.map(rule => `${JSON.stringify(rule.match)}>${rule.teamRole}`).sort()).toEqual([
        '{"plan":"member-plan"}>volunteer',
        '{"role":"barmanager"}>ba',
        '{"role":"crew"}>bartender',
      ])
      expect(rules.every(rule => rule.teamId === null)).toBe(true)
    })

    it('adds no presets when they are off, and a global barmanager is a BA on the crew\'s teams when they are on', async () => {
      const off = await newCrew({ presets: false })
      const on = await newCrew()
      const manager = await user('Manager', 'bar.test')
      const crewRole = await user('Crewrole', 'crew.test')
      expect((await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.mappings}?ownerType=operation&ownerId=${off.op.id}`))) as unknown as Json[]).toEqual([])

      const grants = await myTeams(manager.cookie)
      expect(grants.find(grant => grant.teamId === on.teamId)).toMatchObject({ role: 'ba', source: 'mapped', ownerType: 'operation', ownerId: on.op.id })
      expect(grants.find(grant => grant.teamId === off.teamId)).toBeUndefined()
      expect((await myTeams(crewRole.cookie)).find(grant => grant.teamId === on.teamId)).toMatchObject({ role: 'bartender', source: 'mapped' })
      // A mapped grant is no participation: the viewer does not take part in the operation.
      expect((await getViewer(manager.cookie)).operationIds).not.toContain(on.op.id)
    })

    it('refuses a form that cannot register applicants, or that another operation recruits with', async () => {
      const crew = await newCrew()
      const open = await createForm({ ...FORM_DEFINITION, access: { availability: 'web', auth: 'none' } })
      const unstored = await createForm({ ...FORM_DEFINITION, storage: 'none' })
      expect((await saveSettings(crew.op.id, { formId: open.id })).status).toBe(400)
      expect((await saveSettings(crew.op.id, { formId: unstored.id })).status).toBe(400)
      expect((await saveSettings(crew.op.id, { formId: 'frm_missing' })).status).toBe(400)
      const other = await createOperation()
      await expectApiError(saveSettings(other.id, { formId: crew.form.id }), 409, 'conflict')
      // The default team must belong to the operation, the window must be a window.
      const elsewhere = await newCrew()
      expect((await saveSettings(crew.op.id, { formId: crew.form.id, defaultTeamId: elsewhere.teamId })).status).toBe(400)
      expect((await saveSettings(crew.op.id, { formId: crew.form.id, opensAt: '2027-02-01T00:00:00.000Z', closesAt: '2027-01-01T00:00:00.000Z' })).status).toBe(400)
      // The settings stay as they were.
      expect(await ok(await json(staff.cookie, 'GET', crewApi.admin.settings(crew.op.id)))).toMatchObject({ formId: crew.form.id })
    })
  })

  describe('applying', () => {
    it('registers an application: applied, pending on the team, no grant and not participating', async () => {
      const crew = await newCrew()
      const alice = await user('Alice')
      expect(await ok(await json(alice.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ state: 'open', formSlug: crew.form.slug, operationId: crew.op.id, crewStatus: null })
      // The operation is found by its id as well.
      expect(await ok(await json(alice.cookie, 'GET', crewApi.apply(crew.op.id)))).toMatchObject({ state: 'open', operationSlug: crew.op.slug })

      await ok(await apply(alice, crew, { phone: '+4511223344', motivation: 'I love bars' }))

      const mine = await ok(await json(alice.cookie, 'GET', crewApi.me.crew)) as unknown as Json[]
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatchObject({ operationId: crew.op.id, operationSlug: crew.op.slug, crewStatus: 'applied', teamId: crew.teamId, role: 'volunteer', waitlistPosition: null })
      expect(await ok(await json(alice.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ state: 'applied', crewStatus: 'applied', formSlug: null })

      // Pending in teams: listed on the team, but no read, no role, nothing in the viewer, no participation.
      expect(await myTeams(alice.cookie)).toEqual([])
      expect(await myOperations(alice.cookie)).toEqual([])
      expect((await getViewer(alice.cookie)).operationIds).toEqual([])
      const members = await ok(await json(staff.cookie, 'GET', teamsApi.members(crew.teamId))) as unknown as Json[]
      expect(members.find(member => member.userId === alice.id)).toMatchObject({ role: 'volunteer', status: 'pending' })

      const row = await rowOf(crew, alice)
      expect(row).toMatchObject({ crewStatus: 'applied', teamId: crew.teamId, role: 'volunteer', email: alice.email, phone: '+4511223344', previousCrew: false, decidedAt: null })
      expect(row.appliedAt).toBeTruthy()
      expect(row.submissionId).toBeTruthy()

      expect(await hookNames(alice)).toEqual(['crew:applied'])
      const emails = await getEmailsTo(alice.email)
      expect(emails).toHaveLength(1)
      expect(emails[0]!.template?.name).toBe('crew-status-applied')
      expect(emails[0]!.subject).toContain(crew.op.name.en)
    })

    it('does not register anybody twice', async () => {
      const crew = await newCrew()
      const bob = await user('Bob')
      const first = await applied(bob, crew)
      await ok(await apply(bob, crew, { motivation: 'again' }))
      const page = await list(staff.cookie, crew)
      expect(page.items.filter((item: Json) => item.userId === bob.id)).toHaveLength(1)
      expect((await rowOf(crew, bob)).id).toBe(first.id)
      expect(await hookNames(bob)).toEqual(['crew:applied'])
      expect(await getEmailsTo(bob.email)).toHaveLength(1)
    })

    it('registers nobody outside the window, and when the operation is over', async () => {
      // The database keeps whole seconds.
      const soon = new Date(Math.floor(Date.now() / 1000) * 1000 + 3_600_000).toISOString()
      const scheduled = await newCrew({ opensAt: soon })
      const early = await user('Early')
      expect(await ok(await json(early.cookie, 'GET', crewApi.apply(scheduled.op.slug)))).toMatchObject({ state: 'scheduled', opensAt: soon, formSlug: null })
      await ok(await apply(early, scheduled))
      expect(await ok(await json(early.cookie, 'GET', crewApi.me.crew))).toEqual([])
      // Opening the window lets the same person in.
      await ok(await saveSettings(scheduled.op.id, { formId: scheduled.form.id, opensAt: null }))
      await ok(await apply(early, scheduled))
      expect(await ok(await json(early.cookie, 'GET', crewApi.me.crew))).toHaveLength(1)

      const closed = await newCrew({ closesAt: new Date(Date.now() - 3_600_000).toISOString() })
      const late = await user('Late')
      expect(await ok(await json(late.cookie, 'GET', crewApi.apply(closed.op.slug)))).toMatchObject({ state: 'closed', formSlug: null })
      await ok(await apply(late, closed))
      expect(await ok(await json(late.cookie, 'GET', crewApi.me.crew))).toEqual([])

      // An operation that wrapped up takes no more applications either.
      const over = await newCrew()
      await ok(await json(staff.cookie, 'POST', operationsApi.admin.status(over.op.id), { status: 'active' }))
      await ok(await json(staff.cookie, 'POST', operationsApi.admin.status(over.op.id), { status: 'wrapped_up' }))
      expect(await ok(await json(late.cookie, 'GET', crewApi.apply(over.op.slug)))).toMatchObject({ state: 'closed' })

      // No form set up: nothing to apply with.
      const bare = await createOperation()
      expect(await ok(await json(late.cookie, 'GET', crewApi.apply(bare.slug)))).toMatchObject({ state: 'unavailable', formSlug: null })
    })

    it('needs a signed-in user and a known operation', async () => {
      const crew = await newCrew()
      await expectApiError(json(undefined, 'GET', crewApi.apply(crew.op.slug)), 401)
      await expectApiError(json((await user('Nobody')).cookie, 'GET', crewApi.apply('operation-that-does-not-exist')), 404)
    })

    it('waitlists applications over the capacity, in order, and promotes the next when a place frees', async () => {
      const crew = await newCrew({ capacity: 1, waitlist: true })
      const [first, second, third] = [await user('First'), await user('Second'), await user('Third')] as [Session, Session, Session]
      await approve(await applied(first, crew))
      expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.settings(crew.op.id)))).approved).toBe(1)

      expect(await applied(second, crew)).toMatchObject({ crewStatus: 'waitlisted', waitlistPosition: 1 })
      expect(await applied(third, crew)).toMatchObject({ crewStatus: 'waitlisted', waitlistPosition: 2 })
      expect(await hookNames(second)).toEqual(['crew:applied', 'crew:waitlisted'])
      expect((await getEmailsTo(second.email)).map(email => email.template?.name)).toEqual(['crew-status-waitlisted'])
      expect(await myOperations(second.cookie)).toEqual([])

      // The first one gives up their place: the second moves up, the third waits on.
      await ok(await json(first.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))
      expect(await rowOf(crew, first)).toMatchObject({ crewStatus: 'withdrawn' })
      expect(await rowOf(crew, second)).toMatchObject({ crewStatus: 'approved', waitlistPosition: null })
      expect(await rowOf(crew, third)).toMatchObject({ crewStatus: 'waitlisted' })
      expect(await hookNames(second)).toEqual(['crew:applied', 'crew:waitlisted', 'teams:added', 'crew:approved'])
      expect((await getEmailsTo(second.email)).map(email => email.template?.name)).toEqual(['crew-status-waitlisted', 'crew-status-approved'])
      expect((await myOperations(second.cookie)).map(operation => operation.id)).toEqual([crew.op.id])

      // A bigger capacity moves the next one up as well.
      await ok(await saveSettings(crew.op.id, { formId: crew.form.id, capacity: 2 }))
      expect(await rowOf(crew, third)).toMatchObject({ crewStatus: 'approved' })
    })

    it('without a waiting list, applications over the capacity stay applied', async () => {
      const crew = await newCrew({ capacity: 1, waitlist: false })
      await approve(await applied(await user('Taken'), crew))
      expect(await applied(await user('Extra'), crew)).toMatchObject({ crewStatus: 'applied', waitlistPosition: null })
    })
  })

  describe('decisions', () => {
    it('approves into the team: active, a role, participation, the hooks and the email', async () => {
      const crew = await newCrew()
      const cara = await user('Cara')
      const row = await applied(cara, crew)
      const approved = await approve(row)
      expect(approved).toMatchObject({ id: row.id, crewStatus: 'approved', role: 'volunteer', teamId: crew.teamId })
      expect(approved.decidedAt).toBeTruthy()
      expect(approved.decidedBy).toBe(staff.id)

      // Teams sees an active membership: the role, in the viewer and in /api/operations/me.
      expect(await myTeams(cara.cookie)).toEqual([expect.objectContaining({ teamId: crew.teamId, role: 'volunteer', source: 'explicit', ownerId: crew.op.id })])
      expect(((await ok(await json(staff.cookie, 'GET', teamsApi.members(crew.teamId)))) as unknown as Json[]).find(member => member.userId === cara.id)).toMatchObject({ status: 'active' })
      expect((await myOperations(cara.cookie)).map(operation => operation.id)).toEqual([crew.op.id])
      expect((await getViewer(cara.cookie)).operationIds).toEqual([crew.op.id])
      expect(await ok(await json(cara.cookie, 'GET', crewApi.me.crew))).toEqual([expect.objectContaining({ crewStatus: 'approved', role: 'volunteer' })])

      expect(await hookNames(cara)).toEqual(['crew:applied', 'teams:added', 'crew:approved'])
      expect((await getEmailsTo(cara.email)).map(email => email.template?.name)).toEqual(['crew-status-applied', 'crew-status-approved'])

      // Approving again is a no-op: no hook, no email.
      await approve(row)
      expect(await hookNames(cara)).toHaveLength(3)
      expect(await getEmailsTo(cara.email)).toHaveLength(2)
    })

    it('approves into another team and role, and moves an approved person between them', async () => {
      const crew = await newCrew()
      const bar = await createTeam(crew, 'Bar B')
      const dan = await user('Dan')
      const row = await applied(dan, crew)

      expect((await json(staff.cookie, 'POST', crewApi.admin.approve(row.id), { teamId: 'tem_missing' })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', crewApi.admin.approve(row.id), { role: 'wizard' })).status).toBe(400)
      expect(await rowOf(crew, dan)).toMatchObject({ crewStatus: 'applied' })

      expect(await approve(row, { teamId: bar.id, role: 'ba' })).toMatchObject({ crewStatus: 'approved', teamId: bar.id, role: 'ba' })
      expect(await myTeams(dan.cookie)).toEqual([expect.objectContaining({ teamId: bar.id, role: 'ba', source: 'explicit' })])
      expect(await hookNames(dan)).toEqual(['crew:applied', 'teams:added', 'crew:approved'])
      expect((await getHooksOf(dan.id)).find(entry => entry.name === 'teams:added')).toMatchObject({ teamId: bar.id, role: 'ba' })

      // Same team, other role: the teams role-changed hook.
      const patched = await ok(await json(staff.cookie, 'PATCH', crewApi.admin.member(row.id), { role: 'bartender' }))
      expect(patched).toMatchObject({ teamId: bar.id, role: 'bartender', crewStatus: 'approved' })
      expect((await getHooksOf(dan.id)).at(-1)).toMatchObject({ name: 'teams:role-changed', from: 'ba', to: 'bartender' })

      // Another team: removed from the first, added to the second.
      await ok(await json(staff.cookie, 'PATCH', crewApi.admin.member(row.id), { teamId: crew.teamId }))
      expect((await getHooksOf(dan.id)).slice(-2)).toMatchObject([{ name: 'teams:removed', teamId: bar.id }, { name: 'teams:added', teamId: crew.teamId }])
      expect(await myTeams(dan.cookie)).toEqual([expect.objectContaining({ teamId: crew.teamId, role: 'bartender' })])
      expect((await json(staff.cookie, 'PATCH', crewApi.admin.member(row.id), { role: 'wizard' })).status).toBe(400)
      expect((await json(staff.cookie, 'PATCH', crewApi.admin.member(row.id), {})).status).toBe(400)
    })

    it('rejects an application, and takes an approved person off the crew', async () => {
      const crew = await newCrew()
      const eve = await user('Eve')
      const row = await applied(eve, crew)
      expect(await reject(row)).toMatchObject({ crewStatus: 'rejected' })
      expect(await myTeams(eve.cookie)).toEqual([])
      expect(await hookNames(eve)).toEqual(['crew:applied', 'crew:rejected'])
      expect((await getEmailsTo(eve.email)).map(email => email.template?.name)).toEqual(['crew-status-applied', 'crew-status-rejected'])
      // The decision stays when somebody applies again.
      await ok(await apply(eve, crew))
      expect(await rowOf(crew, eve)).toMatchObject({ crewStatus: 'rejected' })
      expect(await ok(await json(eve.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ state: 'rejected' })

      // Staff can still change their mind.
      await approve(row)
      expect((await myOperations(eve.cookie)).map(operation => operation.id)).toEqual([crew.op.id])
      await reject(row)
      expect(await myOperations(eve.cookie)).toEqual([])
      expect(await myTeams(eve.cookie)).toEqual([])
      expect((await hookNames(eve)).slice(-3)).toEqual(['crew:approved', 'teams:removed', 'crew:rejected'])
    })

    it('puts people on the waiting list by hand, and refuses moves the statuses do not allow', async () => {
      const crew = await newCrew()
      const [fay, gus] = [await user('Fay'), await user('Gus')] as [Session, Session]
      const fayRow = await applied(fay, crew)
      const gusRow = await applied(gus, crew)
      expect(await ok(await json(staff.cookie, 'POST', crewApi.admin.waitlist(fayRow.id)))).toMatchObject({ crewStatus: 'waitlisted', waitlistPosition: 1 })
      expect(await ok(await json(staff.cookie, 'POST', crewApi.admin.waitlist(gusRow.id)))).toMatchObject({ crewStatus: 'waitlisted', waitlistPosition: 2 })
      expect(await hookNames(fay)).toEqual(['crew:applied', 'crew:waitlisted'])

      // A withdrawn person can only come back by approval.
      await ok(await json(gus.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))
      await expectApiError(json(staff.cookie, 'POST', crewApi.admin.reject(gusRow.id)), 409, 'crew_invalid_transition')
      await expectApiError(json(staff.cookie, 'POST', crewApi.admin.waitlist(gusRow.id)), 409, 'crew_invalid_transition')
      await expectApiError(json(staff.cookie, 'POST', crewApi.admin.approve('tmm_missing'), {}), 404)
    })

    it('lets people withdraw, and apply again afterwards', async () => {
      const crew = await newCrew()
      const hal = await user('Hal')
      await expectApiError(json(hal.cookie, 'POST', crewApi.me.withdraw(crew.op.id)), 404)
      const row = await applied(hal, crew)
      await approve(row)
      expect((await myOperations(hal.cookie)).map(operation => operation.id)).toEqual([crew.op.id])

      expect(await ok(await json(hal.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))).toMatchObject({ crewStatus: 'withdrawn', operationId: crew.op.id })
      expect(await myOperations(hal.cookie)).toEqual([])
      expect(await myTeams(hal.cookie)).toEqual([])
      expect(await hookNames(hal)).toEqual(['crew:applied', 'teams:added', 'crew:approved', 'teams:removed', 'crew:withdrawn'])
      expect((await getEmailsTo(hal.email)).at(-1)?.template?.name).toBe('crew-status-withdrawn')
      await expectApiError(json(hal.cookie, 'POST', crewApi.me.withdraw(crew.op.id)), 409, 'crew_not_withdrawable')
      expect(await ok(await json(hal.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ state: 'open' })

      // Applying again reopens the same row.
      await ok(await apply(hal, crew))
      expect(await rowOf(crew, hal)).toMatchObject({ id: row.id, crewStatus: 'applied', decidedAt: null })
      expect((await hookNames(hal)).at(-1)).toBe('crew:applied')
    })

    it('approves several people at once and reports the ones it skipped', async () => {
      const crew = await newCrew()
      const other = await newCrew()
      const [ida, ivo, ian] = [await user('Ida'), await user('Ivo'), await user('Ian')] as [Session, Session, Session]
      const rows = [await applied(ida, crew), await applied(ivo, crew)]
      const stranger = await applied(ian, other)
      await approve(rows[1]!)

      const result = await ok(await json(staff.cookie, 'POST', crewApi.admin.approveMany(crew.op.id), { ids: [...rows.map(row => row.id), stranger.id, 'tmm_missing'] }))
      expect(result.approved.map((member: Json) => member.userId)).toEqual([ida.id])
      expect(result.skipped.sort()).toEqual([rows[1]!.id, stranger.id, 'tmm_missing'].sort())
      expect(await rowOf(crew, ida)).toMatchObject({ crewStatus: 'approved' })
      expect(await rowOf(other, ian)).toMatchObject({ crewStatus: 'applied' })
      expect((await json(staff.cookie, 'POST', crewApi.admin.approveMany(crew.op.id), { ids: [] })).status).toBe(400)
    })
  })

  describe('emails', () => {
    it('sends the operation\'s own text, with variables, and nothing for a status that is turned off', async () => {
      const crew = await newCrew({
        statusEmails: {
          applied: { enabled: false },
          approved: { subject: { en: 'Welcome to {{operation}}, {{name}}!' }, body: 'See you at {{team}}, as {{role}}.' },
        },
      })
      const mia = await user('Mia')
      const row = await applied(mia, crew)
      expect(await getEmailsTo(mia.email)).toEqual([])
      await approve(row)
      const [email] = await getEmailsTo(mia.email)
      expect(email!.subject).toBe(`Welcome to ${crew.op.name.en}, Mia!`)
      expect(email!.text).toContain('See you at Crew, as Volunteer.')
      expect(email!.template?.name).toBe('crew-status-approved')
      expect(email!.template?.props).toMatchObject({ operationName: crew.op.name.en, teamName: 'Crew' })
      expect(await ok(await json(staff.cookie, 'GET', crewApi.admin.settings(crew.op.id)))).toMatchObject({ statusEmails: { applied: { enabled: false } } })
    })
  })

  describe('invites', () => {
    const invite = async (crew: Crew, body: Json = {}): Promise<Json> => ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'ba', ...body }))
    const accept = (who: Session, token: string) => json(who.cookie, 'POST', crewApi.acceptInvite(token))

    it('creates a link whose token is shown once, and lists it without the token', async () => {
      const crew = await newCrew()
      const created = await invite(crew, { maxUses: 3 })
      expect(created.token).toMatch(/^cvt_/)
      expect(created).toMatchObject({ operationId: crew.op.id, teamId: crew.teamId, role: 'ba', maxUses: 3, uses: 0, status: 'active', createdBy: staff.id, path: `/crew/invite/${created.token}` })
      const listed = await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[]
      expect(listed).toHaveLength(1)
      expect(listed[0]).toMatchObject({ id: created.id, prefix: created.token.slice(0, 8), status: 'active' })
      expect(JSON.stringify(listed)).not.toContain(created.token)

      // A team of another operation, an unknown role and a past expiry are refused.
      const elsewhere = await newCrew()
      expect((await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: elsewhere.teamId, role: 'ba' })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'wizard' })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'ba', expiresAt: '2020-01-01T00:00:00.000Z' })).status).toBe(400)
    })

    it('needs a session to create one: an API token is refused (session_required)', async () => {
      const crew = await newCrew()
      // `crew:invite` is session only, so it cannot even be a token scope: a token reaches it with `crew:manage` at most.
      const bot = apiClient({ bearer: await createToken(staff.cookie, [crewAccess.permissions.manage]) })
      await expectApiError(bot.json('POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'ba' }), 403, 'session_required')
      // The same token may still read and manage what is not a credential.
      expect(await bot.json('GET', crewApi.admin.invites(crew.op.id))).toEqual([])
      const plain = apiClient({ cookie: (await user('Plain')).cookie })
      await expectApiError(plain.json('POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'ba' }), 403, 'forbidden')
    })

    it('adds a BA to the team directly, without an application', async () => {
      const crew = await newCrew()
      const created = await invite(crew)
      const ben = await user('Ben')
      const joined = await ok(await accept(ben, created.token))
      expect(joined).toMatchObject({ operationId: crew.op.id, crewStatus: 'approved', teamId: crew.teamId, role: 'ba' })
      expect(await myTeams(ben.cookie)).toEqual([expect.objectContaining({ teamId: crew.teamId, role: 'ba', source: 'explicit' })])
      expect((await myOperations(ben.cookie)).map(operation => operation.id)).toEqual([crew.op.id])
      expect((await getViewer(ben.cookie)).operationIds).toEqual([crew.op.id])
      expect(await rowOf(crew, ben)).toMatchObject({ crewStatus: 'approved', role: 'ba', decidedBy: staff.id })
      expect(await hookNames(ben)).toEqual(['teams:added', 'crew:approved'])
      expect((await getEmailsTo(ben.email)).map(email => email.template?.name)).toEqual(['crew-status-approved'])
      expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[])[0]).toMatchObject({ uses: 1, status: 'used' })

      // The same person again: already on the team, and no use is spent.
      const again = await invite(crew, { maxUses: 2 })
      await expectApiError(accept(ben, again.token), 409, 'crew_already_member')
      expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[]).find(row => row.id === again.id)).toMatchObject({ uses: 0 })
    })

    it('upgrades somebody who applied already, without a second row', async () => {
      const crew = await newCrew()
      const kim = await user('Kim')
      await applied(kim, crew)
      const created = await invite(crew)
      expect(await ok(await accept(kim, created.token))).toMatchObject({ crewStatus: 'approved', role: 'ba' })
      const page = await list(staff.cookie, crew)
      expect(page.items.filter((item: Json) => item.userId === kim.id)).toHaveLength(1)
      expect(await hookNames(kim)).toEqual(['crew:applied', 'teams:added', 'crew:approved'])
    })

    it('stops at the maximum number of uses, even when two people open it at once', async () => {
      const crew = await newCrew()
      const single = await invite(crew, { maxUses: 1 })
      const [lou, max] = [await user('Lou'), await user('Max')] as [Session, Session]
      const results = await Promise.all([accept(lou, single.token), accept(max, single.token)])
      expect(results.map(result => result.status).sort()).toEqual([200, 410])
      const loser = results.find(result => result.status === 410)!
      expect((await loser.json() as Json).data).toMatchObject({ code: 'invite_used' })
      const members = await list(staff.cookie, crew)
      expect(members.total).toBe(1)
      expect([lou.id, max.id]).toContain(members.items[0].userId)
      expect(members.items[0]).toMatchObject({ crewStatus: 'approved', role: 'ba' })

      const double = await invite(crew, { maxUses: 2 })
      const [ned, oli, pia] = [await user('Ned'), await user('Oli'), await user('Pia')] as [Session, Session, Session]
      await ok(await accept(ned, double.token))
      await ok(await accept(oli, double.token))
      await expectApiError(accept(pia, double.token), 410, 'invite_used')
    })

    it('refuses an expired, revoked or unknown link, and one with no signed-in user', async () => {
      const crew = await newCrew()
      const soon = await invite(crew, { expiresAt: new Date(Date.now() + 2_000).toISOString() })
      const revoked = await invite(crew)
      const quinn = await user('Quinn')
      await sleep(2_600)
      await expectApiError(accept(quinn, soon.token), 410, 'invite_expired')

      expect((await json(staff.cookie, 'DELETE', crewApi.admin.invite(revoked.id))).status).toBe(204)
      expect((await json(staff.cookie, 'DELETE', crewApi.admin.invite(revoked.id))).status).toBe(204)
      await expectApiError(accept(quinn, revoked.token), 410, 'invite_revoked')
      expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[]).map(row => `${row.id}:${row.status}`).sort()).toEqual([`${soon.id}:expired`, `${revoked.id}:revoked`].sort())
      await expectApiError(accept(quinn, 'cvt_does-not-exist'), 404)
      await expectApiError(json(staff.cookie, 'DELETE', crewApi.admin.invite('civ_missing')), 404)
      await expectApiError(json(undefined, 'POST', crewApi.acceptInvite(soon.token)), 401)
      expect(await rowOf(crew, quinn).catch(() => null)).toBeNull()
    })
  })

  describe('personal data (crew:pii)', () => {
    it('shows emails, phone numbers and answers only to people who hold crew:pii', async () => {
      const crew = await newCrew()
      const rae = await user('Rae')
      const row = await applied(rae, crew, { phone: '+4599887766', motivation: 'Sunsets and pints' })

      const coordinator = await registerUser('Coordinator', `coordinator${++counter}@coord.test`)
      const manager = await registerUser('Manager', `manager${++counter}@mgr.test`)
      const wild = await registerUser('Wild', `wild${++counter}@wild.test`)

      for (const reader of [staff, coordinator]) {
        expect(await rowOf(crew, rae, reader.cookie)).toMatchObject({ email: rae.email, phone: '+4599887766' })
        const submission = await ok(await json(reader.cookie, 'GET', crewApi.admin.submission(row.id)))
        expect(submission).toMatchObject({ formSlug: crew.form.slug, locale: 'en' })
        expect(submission.answers).toEqual(expect.arrayContaining([
          expect.objectContaining({ key: 'motivation', label: 'Why do you want to join?', value: 'Sunsets and pints' }),
          expect.objectContaining({ key: 'phone', value: '+4599887766' }),
        ]))
        expect((await list(reader.cookie, crew, `&q=${encodeURIComponent(rae.email)}`)).items).toHaveLength(1)
      }
      // A crew manager without crew:pii (and a crew:* wildcard, which never covers it) manage, but see no contact details.
      for (const reader of [manager, wild]) {
        const seen = await rowOf(crew, rae, reader.cookie)
        expect(seen).toMatchObject({ crewStatus: 'applied', name: expect.any(String) })
        expect(seen).not.toHaveProperty('email')
        expect(seen).not.toHaveProperty('phone')
        await expectApiError(json(reader.cookie, 'GET', crewApi.admin.submission(row.id)), 403)
        // The search does not reach the email either.
        expect((await list(reader.cookie, crew, `&q=${encodeURIComponent(rae.email)}`)).items).toHaveLength(0)
      }
      // The answers of a person without an application (an invite) are not there.
      const invited = await ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'bartender' }))
      const sam = await user('Sam')
      await ok(await json(sam.cookie, 'POST', crewApi.acceptInvite(invited.token)))
      await expectApiError(json(staff.cookie, 'GET', crewApi.admin.submission((await rowOf(crew, sam)).id)), 404)
    })
  })

  describe('team leads', () => {
    it('lets a lead read the crew of their own teams, and nobody else\'s', async () => {
      const crew = await newCrew()
      const teamB = await createTeam(crew, 'Bar B')
      const [lead, onA, onB, plain] = [await user('Lead'), await user('Ona'), await user('Onb'), await user('Plain')] as [Session, Session, Session, Session]

      await approve(await applied(lead, crew), { role: 'ba' })
      await approve(await applied(onA, crew))
      await approve(await applied(onB, crew), { teamId: teamB.id })
      await applied(plain, crew)

      const seen = await list(lead.cookie, crew)
      expect(seen.items.map((item: Json) => item.userId).sort()).toEqual([lead.id, onA.id, plain.id].sort())
      expect(seen.items.every((item: Json) => item.teamId === crew.teamId && !('email' in item))).toBe(true)
      expect(seen.total).toBe(3)
      expect((await list(lead.cookie, crew, `&team=${teamB.id}`)).items).toEqual([])

      const ownRow = await rowOf(crew, onA)
      const otherRow = await rowOf(crew, onB)
      expect(await ok(await json(lead.cookie, 'GET', crewApi.admin.member(ownRow.id)))).toMatchObject({ userId: onA.id })
      await expectApiError(json(lead.cookie, 'GET', crewApi.admin.member(otherRow.id)), 403, 'forbidden')

      // Leading is reading, not managing.
      await expectApiError(json(lead.cookie, 'POST', crewApi.admin.reject(ownRow.id)), 403, 'forbidden')
      await expectApiError(json(lead.cookie, 'GET', crewApi.admin.settings(crew.op.id)), 403, 'forbidden')

      // A volunteer sees no list, but their own row; an applicant sees nothing of anybody.
      expect((await list(onA.cookie, crew)).items).toEqual([])
      expect(await ok(await json(onA.cookie, 'GET', crewApi.admin.member(ownRow.id)))).toMatchObject({ userId: onA.id })
      await expectApiError(json(onA.cookie, 'GET', crewApi.admin.member((await rowOf(crew, lead)).id)), 403, 'forbidden')
      expect((await list(plain.cookie, crew)).items).toEqual([])
    })
  })

  describe('earlier crew', () => {
    it('knows who was approved in an earlier operation, filters and sorts by it, and promotes them first when asked', async () => {
      const past = await newCrew({}, { startsAt: '2026-06-27T10:00:00.000Z' })
      const veteran = await user('Veteran')
      await approve(await applied(veteran, past))

      const crew = await newCrew({ capacity: 1, waitlist: true, previousCrewFirst: true })
      const [holder, newcomer] = [await user('Holder'), await user('Newcomer')] as [Session, Session]
      await approve(await applied(holder, crew))
      await applied(newcomer, crew)
      const veteranRow = await applied(veteran, crew)
      expect(veteranRow).toMatchObject({ previousCrew: true, crewStatus: 'waitlisted', waitlistPosition: 2 })
      expect(await rowOf(crew, newcomer)).toMatchObject({ previousCrew: false, waitlistPosition: 1 })
      // The earlier operation is not "earlier" than itself.
      expect(await rowOf(past, veteran)).toMatchObject({ previousCrew: false })

      expect((await list(staff.cookie, crew, '&previous=true')).items.map((item: Json) => item.userId)).toEqual([veteran.id])
      expect((await list(staff.cookie, crew, '&previous=false')).items.map((item: Json) => item.userId).sort()).toEqual([holder.id, newcomer.id].sort())
      expect((await list(staff.cookie, crew, '&sort=previousCrew&order=desc')).items[0]).toMatchObject({ userId: veteran.id })
      expect((await list(staff.cookie, crew, '&status=waitlisted&sort=waitlistPosition&order=asc')).items.map((item: Json) => item.userId)).toEqual([newcomer.id, veteran.id])

      // A place frees up: the veteran moves up although the newcomer was first in line.
      await ok(await json(holder.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))
      expect(await rowOf(crew, veteran)).toMatchObject({ crewStatus: 'approved' })
      expect(await rowOf(crew, newcomer)).toMatchObject({ crewStatus: 'waitlisted' })

      // Without the setting the list keeps its order.
      const plain = await newCrew({ capacity: 1, waitlist: true, previousCrewFirst: false })
      const keeper = await user('Keeper')
      await approve(await applied(keeper, plain))
      const next = await user('Next')
      await applied(next, plain)
      await applied(veteran, plain)
      await ok(await json(keeper.cookie, 'POST', crewApi.me.withdraw(plain.op.id)))
      expect(await rowOf(plain, next)).toMatchObject({ crewStatus: 'approved' })
      expect(await rowOf(plain, veteran)).toMatchObject({ crewStatus: 'waitlisted' })
    })
  })

  describe('access', () => {
    it('denies by default: anonymous 401, non-staff 403 on the staff routes', async () => {
      const crew = await newCrew()
      const nobody = await user('Nobody')
      const row = await applied(await user('Subject'), crew)
      for (const [method, path] of [
        ['GET', crewApi.me.crew],
        ['POST', crewApi.me.withdraw(crew.op.id)],
        ['GET', crewApi.admin.settings(crew.op.id)],
        ['GET', crewApi.admin.members(crew.op.id)],
        ['GET', crewApi.admin.member(row.id)],
        ['GET', crewApi.admin.invites(crew.op.id)],
        ['DELETE', crewApi.admin.invite('civ_missing')],
      ] as Array<[ApiMethod, string]>) {
        expect((await json(undefined, method, path)).status, `${method} ${path}`).toBe(401)
      }
      await expectApiError(json(nobody.cookie, 'GET', crewApi.admin.settings(crew.op.id)), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'PUT', crewApi.admin.settings(crew.op.id), { formId: crew.form.id }), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'GET', crewApi.admin.invites(crew.op.id)), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', crewApi.admin.approve(row.id), {}), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', crewApi.admin.approveMany(crew.op.id), { ids: [row.id] }), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'PATCH', crewApi.admin.member(row.id), { role: 'ba' }), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'DELETE', crewApi.admin.invite('civ_missing')), 403, 'forbidden')
      expect((await list(nobody.cookie, crew)).items).toEqual([])
    })

    it('reads /me with a crew:read token or the crew scope, and refuses a token without (insufficient_scope)', async () => {
      const crew = await newCrew()
      const tess = await user('Tess')
      await applied(tess, crew)
      for (const scope of [crewAccess.permissions.read, 'crew']) {
        const client = apiClient({ bearer: await createToken(tess.cookie, [scope]) })
        expect(await client.json<Json[]>('GET', crewApi.me.crew)).toEqual([expect.objectContaining({ operationId: crew.op.id, crewStatus: 'applied' })])
      }
      const other = apiClient({ bearer: await createToken(tess.cookie, [crewAccess.permissions.apply]) })
      await expectApiError(other.json('GET', crewApi.me.crew), 403, 'insufficient_scope')
      // A staff token needs crew:manage for the staff routes.
      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [crewAccess.permissions.read]) })
      await expectApiError(readOnly.json('GET', crewApi.admin.settings(crew.op.id)), 403, 'insufficient_scope')
      const manage = apiClient({ bearer: await createToken(staff.cookie, [crewAccess.permissions.manage]) })
      expect(await manage.json<Json>('GET', crewApi.admin.settings(crew.op.id))).toMatchObject({ operationId: crew.op.id })
    })

    it('renders the volunteer pages', async () => {
      const crew = await newCrew()
      const uma = await user('Uma')
      for (const path of [`/crew/apply/${crew.op.slug}`, '/crew/status', '/crew/invite/cvt_whatever']) {
        const response = await fetch(path, { headers: { cookie: uma.cookie } })
        expect(response.status, path).toBe(200)
      }
    })
  })
})
