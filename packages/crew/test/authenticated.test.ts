import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { formsApi } from '@frigear-nu/forms/api'
import { operationsApi } from '@frigear-nu/operations/api'
import { teamsApi } from '@frigear-nu/teams/api'
import { crewApi } from '../src/runtime/utils/api'
import { crewAccess } from '../src/runtime/access'
import { getEmailsTo, getHooksOf, getParticipation, registerUser } from './helpers'

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
    public: true,
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
  /** The scoped read of `/api/crew`: what leads, volunteers and staff may read of an operation's crew. */
  const scoped = async (cookie: string, crew: Crew, query = ''): Promise<Json> => ok(await json(cookie, 'GET', `${crewApi.members(crew.op.id)}?pageSize=100${query}`))
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
        '{"role":"crew"}>bartender',
        '{"role":"supervisor"}>lead',
      ])
      expect(rules.every(rule => rule.teamId === null)).toBe(true)
    })

    it('adds no presets when they are off, and a global supervisor is a lead on the crew\'s teams when they are on', async () => {
      const off = await newCrew({ presets: false })
      const on = await newCrew()
      const manager = await user('Manager', 'bar.test')
      const crewRole = await user('Crewrole', 'crew.test')
      expect((await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.mappings}?ownerType=operation&ownerId=${off.op.id}`))) as unknown as Json[]).toEqual([])

      const grants = await myTeams(manager.cookie)
      expect(grants.find(grant => grant.teamId === on.teamId)).toMatchObject({ role: 'lead', source: 'mapped', ownerType: 'operation', ownerId: on.op.id })
      expect(grants.find(grant => grant.teamId === off.teamId)).toBeUndefined()
      expect((await myTeams(crewRole.cookie)).find(grant => grant.teamId === on.teamId)).toMatchObject({ role: 'bartender', source: 'mapped' })
      // A mapped grant is no participation: the manager does not take part in the operation, and no operation grant admits them.
      expect(await getParticipation(manager.cookie, on.op.id)).toMatchObject({ matches: false })
      expect((await getParticipation(manager.cookie)).operationIds).not.toContain(on.op.id)
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

      await ok(await apply(alice, crew, { phone: '+15550100101', motivation: 'I love bars' }))

      const mine = await ok(await json(alice.cookie, 'GET', crewApi.me.crew)) as unknown as Json[]
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatchObject({ operationId: crew.op.id, operationSlug: crew.op.slug, crewStatus: 'applied', teamId: crew.teamId, role: 'volunteer', roleLabel: { en: 'Volunteer', da: 'Frivillig' }, waitlistPosition: null })
      expect(await ok(await json(alice.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ state: 'applied', crewStatus: 'applied', formSlug: null })

      // Pending in teams: listed on the team, but no read, no role, no participation.
      expect(await myTeams(alice.cookie)).toEqual([])
      expect(await myOperations(alice.cookie)).toEqual([])
      expect(await getParticipation(alice.cookie, crew.op.id)).toMatchObject({ operationIds: [], matches: false })
      const members = await ok(await json(staff.cookie, 'GET', teamsApi.members(crew.teamId))) as unknown as Json[]
      expect(members.find(member => member.userId === alice.id)).toMatchObject({ role: 'volunteer', status: 'pending' })

      const row = await rowOf(crew, alice)
      expect(row).toMatchObject({ crewStatus: 'applied', teamId: crew.teamId, role: 'volunteer', email: alice.email, phone: '+15550100101', previousCrew: false, decidedAt: null })
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

      // Teams sees an active membership: the role, participation and /api/operations/me.
      expect(await myTeams(cara.cookie)).toEqual([expect.objectContaining({ teamId: crew.teamId, role: 'volunteer', source: 'explicit', ownerId: crew.op.id })])
      expect(((await ok(await json(staff.cookie, 'GET', teamsApi.members(crew.teamId)))) as unknown as Json[]).find(member => member.userId === cara.id)).toMatchObject({ status: 'active' })
      expect((await myOperations(cara.cookie)).map(operation => operation.id)).toEqual([crew.op.id])
      const participation = await getParticipation(cara.cookie, crew.op.id)
      expect(participation).toMatchObject({ operationIds: [crew.op.id], matches: true })
      expect(participation.members).toContain(cara.id)
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

      expect(await approve(row, { teamId: bar.id, role: 'lead' })).toMatchObject({ crewStatus: 'approved', teamId: bar.id, role: 'lead' })
      expect(await myTeams(dan.cookie)).toEqual([expect.objectContaining({ teamId: bar.id, role: 'lead', source: 'explicit' })])
      expect(await hookNames(dan)).toEqual(['crew:applied', 'teams:added', 'crew:approved'])
      expect((await getHooksOf(dan.id)).find(entry => entry.name === 'teams:added')).toMatchObject({ teamId: bar.id, role: 'lead' })

      // Same team, other role: the teams role-changed hook.
      const patched = await ok(await json(staff.cookie, 'PATCH', crewApi.admin.member(row.id), { role: 'bartender' }))
      expect(patched).toMatchObject({ teamId: bar.id, role: 'bartender', crewStatus: 'approved' })
      expect((await getHooksOf(dan.id)).at(-1)).toMatchObject({ name: 'teams:role-changed', from: 'lead', to: 'bartender' })

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

      // A withdrawn person has left: only they can come back, by applying again.
      await ok(await json(gus.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))
      await expectApiError(json(staff.cookie, 'POST', crewApi.admin.reject(gusRow.id)), 409, 'crew_invalid_transition')
      await expectApiError(json(staff.cookie, 'POST', crewApi.admin.waitlist(gusRow.id)), 409, 'crew_invalid_transition')
      await expectApiError(json(staff.cookie, 'POST', crewApi.admin.approve(gusRow.id), {}), 409, 'crew_invalid_transition')
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

  describe('adding people directly', () => {
    const add = (crew: Crew, body: Json, cookie: string | undefined = staff.cookie) => json(cookie, 'POST', crewApi.admin.addMember(crew.op.id), body)

    it('adds a person approved at once: 201, the role, participation, the hooks and the approval message', async () => {
      const crew = await newCrew()
      const ada = await user('Ada')
      const response = await add(crew, { userId: ada.id })
      expect(response.status).toBe(201)
      const added = await response.json() as Json
      expect(added).toMatchObject({ userId: ada.id, crewStatus: 'approved', role: 'volunteer', teamId: crew.teamId, decidedBy: staff.id, submissionId: null })
      expect(added.appliedAt).toBeTruthy()
      expect(await rowOf(crew, ada)).toMatchObject({ id: added.id, crewStatus: 'approved' })
      expect((await myOperations(ada.cookie)).map(operation => operation.id)).toEqual([crew.op.id])
      expect(await hookNames(ada)).toEqual(['teams:added', 'crew:approved'])
      // The usual approval message, through notifyUser.
      expect((await getEmailsTo(ada.email)).map(email => email.template?.name)).toEqual(['crew-status-approved'])
    })

    it('adds into a team and role of the operation, and refuses a team of another operation', async () => {
      const crew = await newCrew()
      const bar = await createTeam(crew)
      const ben = await user('Ben')
      expect(await ok(await add(crew, { userId: ben.id, teamId: bar.id, role: 'lead' }))).toMatchObject({ teamId: bar.id, role: 'lead', crewStatus: 'approved' })
      const other = await newCrew()
      await expectApiError(add(other, { userId: (await user('Bo')).id, teamId: bar.id }), 400)
      await expectApiError(add(crew, { userId: 999_999 }), 400, 'validation_failed')
    })

    it('answers 409 with the status for a person who applied, is on the waiting list or is approved', async () => {
      const crew = await newCrew()
      const [pia, wes, abe] = [await user('Pia'), await user('Wes'), await user('Abe')] as [Session, Session, Session]
      const piaRow = await applied(pia, crew)
      const wesRow = await applied(wes, crew)
      await ok(await json(staff.cookie, 'POST', crewApi.admin.waitlist(wesRow.id)))
      await approve(await applied(abe, crew))
      for (const [who, status] of [[pia, 'applied'], [wes, 'waitlisted'], [abe, 'approved']] as Array<[Session, string]>) {
        const error = await expectApiError(add(crew, { userId: who.id }), 409, 'conflict')
        expect(error.data, status).toMatchObject({ status, field: 'userId' })
      }
      expect((await expectApiError(add(crew, { userId: pia.id }), 409)).data).toMatchObject({ memberId: piaRow.id })
      // Nothing changed for them.
      expect(await rowOf(crew, pia)).toMatchObject({ crewStatus: 'applied' })
      expect(await rowOf(crew, wes)).toMatchObject({ crewStatus: 'waitlisted' })
    })

    it('reuses the row of a withdrawn or rejected person and approves it (200)', async () => {
      const crew = await newCrew()
      const [wil, rex] = [await user('Wil'), await user('Rex')] as [Session, Session]
      const wilRow = await applied(wil, crew)
      await ok(await json(wil.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))
      const rexRow = await applied(rex, crew)
      await reject(rexRow)
      for (const [who, row] of [[wil, wilRow], [rex, rexRow]] as Array<[Session, Json]>) {
        const response = await add(crew, { userId: who.id })
        expect(response.status, who.email).toBe(200)
        expect(await response.json()).toMatchObject({ id: row.id, crewStatus: 'approved', decidedBy: staff.id })
        expect((await hookNames(who)).slice(-2)).toEqual(['teams:added', 'crew:approved'])
        expect((await getEmailsTo(who.email)).at(-1)?.template?.name).toBe('crew-status-approved')
      }
      expect((await list(staff.cookie, crew)).items.filter((item: Json) => item.userId === wil.id)).toHaveLength(1)
    })

    it('checks access before the operation: 401, 403, insufficient_scope, then 404', async () => {
      const crew = await newCrew()
      const nobody = await user('Nobody')
      const target = await user('Target')
      for (const operationId of [crew.op.id, 'op_missing']) {
        const path = crewApi.admin.addMember(operationId)
        expect((await json(undefined, 'POST', path, { userId: target.id })).status).toBe(401)
        await expectApiError(json(nobody.cookie, 'POST', path, { userId: target.id }), 403, 'forbidden')
      }
      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [crewAccess.permissions.read]) })
      await expectApiError(readOnly.fetch('POST', crewApi.admin.addMember(crew.op.id), { userId: target.id }), 403, 'insufficient_scope')
      await expectApiError(json(staff.cookie, 'POST', crewApi.admin.addMember('op_missing'), { userId: target.id }), 404)
      // A token with crew:manage may add people (it is no credential).
      const manage = apiClient({ bearer: await createToken(staff.cookie, [crewAccess.permissions.manage]) })
      expect((await manage.fetch('POST', crewApi.admin.addMember(crew.op.id), { userId: (await user('Tok')).id })).status).toBe(201)
    })

    it('finds users for the picker: staff only, emails only with crew:pii', async () => {
      const zed = await user('Zedekiah')
      const found = await ok(await json(staff.cookie, 'GET', `${crewApi.admin.users}?q=zedekiah`)) as unknown as Json[]
      expect(found).toEqual([expect.objectContaining({ id: zed.id, name: 'Zedekiah', email: zed.email })])
      expect((await json(undefined, 'GET', `${crewApi.admin.users}?q=zed`)).status).toBe(401)
      await expectApiError(json(zed.cookie, 'GET', `${crewApi.admin.users}?q=zed`), 403, 'forbidden')
      const noPii = apiClient({ bearer: await createToken(staff.cookie, [crewAccess.permissions.manage]) })
      const withoutPii = await noPii.json<Json[]>('GET', `${crewApi.admin.users}?q=zedekiah`)
      expect(withoutPii).toEqual([expect.objectContaining({ id: zed.id })])
      expect(withoutPii[0]).not.toHaveProperty('email')
      expect(await noPii.json<Json[]>('GET', `${crewApi.admin.users}?q=${encodeURIComponent(zed.email)}`)).toEqual([])
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
    const invite = async (crew: Crew, body: Json = {}): Promise<Json> => ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'lead', ...body }))
    const accept = (who: Session, token: string) => json(who.cookie, 'POST', crewApi.acceptInvite(token))

    it('creates a link whose token is shown once, and lists it without the token', async () => {
      const crew = await newCrew()
      const created = await invite(crew, { maxUses: 3 })
      expect(created.token).toMatch(/^cvt_/)
      expect(created).toMatchObject({ operationId: crew.op.id, teamId: crew.teamId, role: 'lead', maxUses: 3, uses: 0, status: 'active', createdBy: staff.id, path: `/crew/invite/${created.token}` })
      const listed = await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[]
      expect(listed).toHaveLength(1)
      expect(listed[0]).toMatchObject({ id: created.id, prefix: created.token.slice(0, 8), status: 'active' })
      expect(JSON.stringify(listed)).not.toContain(created.token)

      // A team of another operation, an unknown role and a past expiry are refused.
      const elsewhere = await newCrew()
      expect((await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: elsewhere.teamId, role: 'lead' })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'wizard' })).status).toBe(400)
      expect((await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'lead', expiresAt: '2020-01-01T00:00:00.000Z' })).status).toBe(400)
    })

    it('needs a session to create one: an API token is refused (session_required)', async () => {
      const crew = await newCrew()
      // `crew:invite` is session only, so it cannot even be a token scope: a token reaches it with `crew:manage` at most.
      const bot = apiClient({ bearer: await createToken(staff.cookie, [crewAccess.permissions.manage]) })
      await expectApiError(bot.json('POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'lead' }), 403, 'session_required')
      // The same token may still read and manage what is not a credential.
      expect(await bot.json('GET', crewApi.admin.invites(crew.op.id))).toEqual([])
      const plain = apiClient({ cookie: (await user('Plain')).cookie })
      await expectApiError(plain.json('POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'lead' }), 403, 'forbidden')
    })

    it('adds a lead to the team directly, without an application', async () => {
      const crew = await newCrew()
      const created = await invite(crew)
      const ben = await user('Ben')
      const joined = await ok(await accept(ben, created.token))
      expect(joined).toMatchObject({ operationId: crew.op.id, crewStatus: 'approved', teamId: crew.teamId, role: 'lead', roleLabel: { en: 'Lead' } })
      expect(await myTeams(ben.cookie)).toEqual([expect.objectContaining({ teamId: crew.teamId, role: 'lead', source: 'explicit' })])
      expect((await myOperations(ben.cookie)).map(operation => operation.id)).toEqual([crew.op.id])
      expect((await getParticipation(ben.cookie)).operationIds).toEqual([crew.op.id])
      expect(await rowOf(crew, ben)).toMatchObject({ crewStatus: 'approved', role: 'lead', decidedBy: staff.id })
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
      expect(await ok(await accept(kim, created.token))).toMatchObject({ crewStatus: 'approved', role: 'lead' })
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
      expect(members.items[0]).toMatchObject({ crewStatus: 'approved', role: 'lead' })

      const double = await invite(crew, { maxUses: 2 })
      const [ned, oli, pia] = [await user('Ned'), await user('Oli'), await user('Pia')] as [Session, Session, Session]
      await ok(await accept(ned, double.token))
      await ok(await accept(oli, double.token))
      await expectApiError(accept(pia, double.token), 410, 'invite_used')
    })

    it('expires in 30 days unless staff set an expiry', async () => {
      const crew = await newCrew()
      const before = Date.now()
      const created = await invite(crew)
      const expires = new Date(created.expiresAt).getTime()
      expect(expires).toBeGreaterThanOrEqual(before + 30 * 86_400_000 - 2_000)
      expect(expires).toBeLessThanOrEqual(Date.now() + 30 * 86_400_000 + 2_000)
      const chosen = new Date(Math.floor(Date.now() / 1000) * 1000 + 3 * 86_400_000).toISOString()
      expect(await invite(crew, { expiresAt: chosen })).toMatchObject({ expiresAt: chosen })
    })

    it('answers 410 for an operation that wrapped up, was archived or has ended, and spends no use', async () => {
      const wrapped = await newCrew()
      const archived = await newCrew()
      const ended = await newCrew({}, { startsAt: '2020-06-01T10:00:00.000Z', endsAt: '2020-06-03T10:00:00.000Z' })
      const links = [await invite(wrapped), await invite(archived), await invite(ended)]
      await ok(await json(staff.cookie, 'POST', operationsApi.admin.status(wrapped.op.id), { status: 'active' }))
      await ok(await json(staff.cookie, 'POST', operationsApi.admin.status(wrapped.op.id), { status: 'wrapped_up' }))
      await ok(await json(staff.cookie, 'POST', operationsApi.admin.status(archived.op.id), { status: 'archived' }))
      const late = await user('Toolate')
      for (const [index, crew] of [wrapped, archived, ended].entries()) {
        await expectApiError(accept(late, links[index]!.token), 410, 'invite_unavailable')
        expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[])[0]).toMatchObject({ uses: 0 })
      }
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
      const row = await applied(rae, crew, { phone: '+15550100102', motivation: 'Sunsets and pints' })

      const coordinator = await registerUser('Coordinator', `coordinator${++counter}@coord.test`)
      const senior = await registerUser('Senior', `senior${++counter}@senior.test`)
      const manager = await registerUser('Manager', `manager${++counter}@mgr.test`)
      const wild = await registerUser('Wild', `wild${++counter}@wild.test`)

      // `admin` holds crew:pii by default; a coordinating role only when the host grants it by name.
      for (const reader of [staff, senior]) {
        expect(await rowOf(crew, rae, reader.cookie)).toMatchObject({ email: rae.email, phone: '+15550100102' })
        const submission = await ok(await json(reader.cookie, 'GET', crewApi.admin.submission(row.id)))
        expect(submission).toMatchObject({ formSlug: crew.form.slug, locale: 'en' })
        expect(submission.answers).toEqual(expect.arrayContaining([
          expect.objectContaining({ key: 'motivation', label: 'Why do you want to join?', value: 'Sunsets and pints' }),
          expect.objectContaining({ key: 'phone', value: '+15550100102' }),
        ]))
        expect((await list(reader.cookie, crew, `&q=${encodeURIComponent(rae.email)}`)).items).toHaveLength(1)
      }
      // A crew manager without crew:pii (a plain coordinator, and a crew:* wildcard, which never covers it) manage, but
      // see no contact details.
      for (const reader of [coordinator, manager, wild]) {
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

      await approve(await applied(lead, crew), { role: 'lead' })
      await approve(await applied(onA, crew))
      await approve(await applied(onB, crew), { teamId: teamB.id })
      await applied(plain, crew)

      const seen = await scoped(lead.cookie, crew)
      expect(seen.items.map((item: Json) => item.userId).sort()).toEqual([lead.id, onA.id, plain.id].sort())
      expect(seen.items.every((item: Json) => item.teamId === crew.teamId && !('email' in item))).toBe(true)
      expect(seen.total).toBe(3)
      expect((await scoped(lead.cookie, crew, `&team=${teamB.id}`)).items).toEqual([])

      const ownRow = await rowOf(crew, onA)
      const otherRow = await rowOf(crew, onB)
      expect(await ok(await json(lead.cookie, 'GET', crewApi.member(ownRow.id)))).toMatchObject({ userId: onA.id })
      await expectApiError(json(lead.cookie, 'GET', crewApi.member(otherRow.id)), 403, 'forbidden')

      // Leading is reading, not managing.
      await expectApiError(json(lead.cookie, 'POST', crewApi.admin.reject(ownRow.id)), 403, 'forbidden')
      await expectApiError(json(lead.cookie, 'GET', crewApi.admin.settings(crew.op.id)), 403, 'forbidden')

      // A volunteer sees no list, but their own row; an applicant sees nothing of anybody.
      expect((await scoped(onA.cookie, crew)).items).toEqual([])
      expect(await ok(await json(onA.cookie, 'GET', crewApi.member(ownRow.id)))).toMatchObject({ userId: onA.id })
      await expectApiError(json(onA.cookie, 'GET', crewApi.member((await rowOf(crew, lead)).id)), 403, 'forbidden')
      expect((await scoped(plain.cookie, crew)).items).toEqual([])
    })
  })

  describe('earlier crew', () => {
    it('searches crew names with capital Ø, Æ and Å in any case (users.searchText)', async () => {
      const crew = await newCrew()
      const ostergaard = await registerUser('ØSTERGÅRD Æbelø', `ostergaard${++counter}@example.com`)
      const other = await user('Other')
      await applied(ostergaard, crew)
      await applied(other, crew)
      const found = async (q: string) => (await list(staff.cookie, crew, `&q=${encodeURIComponent(q)}`)).items.map((item: Json) => item.userId)
      for (const q of ['østergård', 'ØSTERGÅRD æbelø', 'Æbelø']) expect(await found(q), q).toEqual([ostergaard.id])
    })

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

  describe('waiting list rules', () => {
    it('never promotes the person staff just waitlisted, and only promotes people the full crew waitlisted', async () => {
      const crew = await newCrew({ capacity: 1, waitlist: true })
      const [holder, queued, parked] = [await user('Holder'), await user('Queued'), await user('Parked')] as [Session, Session, Session]
      // Staff parked somebody while there was room, before the crew filled up.
      const parkedRow = await applied(parked, crew)
      await ok(await json(staff.cookie, 'POST', crewApi.admin.waitlist(parkedRow.id)))
      const holderRow = await applied(holder, crew)
      await approve(holderRow)
      expect(await applied(queued, crew)).toMatchObject({ crewStatus: 'waitlisted' })

      // Staff demote the holder to the waiting list: the place goes to the one the full crew waitlisted, not back to them.
      expect(await ok(await json(staff.cookie, 'POST', crewApi.admin.waitlist(holderRow.id)))).toMatchObject({ crewStatus: 'waitlisted' })
      expect(await rowOf(crew, queued)).toMatchObject({ crewStatus: 'approved' })
      expect(await rowOf(crew, holder)).toMatchObject({ crewStatus: 'waitlisted' })
      expect(await rowOf(crew, parked)).toMatchObject({ crewStatus: 'waitlisted' })

      // A bigger capacity promotes nobody staff waitlisted.
      await ok(await saveSettings(crew.op.id, { formId: crew.form.id, capacity: 10 }))
      expect(await rowOf(crew, holder)).toMatchObject({ crewStatus: 'waitlisted' })
      expect((await list(staff.cookie, crew, '&status=waitlisted')).items.map((item: Json) => item.userId).sort()).toEqual([holder.id, parked.id].sort())
    })

    it('keeps a person staff waitlisted waitlisted when a place frees', async () => {
      const crew = await newCrew({ capacity: 5, waitlist: true })
      const [one, two] = [await user('Sticky'), await user('Free')] as [Session, Session]
      const row = await applied(one, crew)
      await ok(await json(staff.cookie, 'POST', crewApi.admin.waitlist(row.id)))
      await approve(await applied(two, crew))
      await ok(await json(two.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))
      expect(await rowOf(crew, one)).toMatchObject({ crewStatus: 'waitlisted' })
    })

    it('lets a status change that lost a race do nothing: no second hook, no second email', async () => {
      const crew = await newCrew()
      const racer = await user('Racer')
      const row = await applied(racer, crew)
      const results = await Promise.all([json(staff.cookie, 'POST', crewApi.admin.approve(row.id), {}), json(staff.cookie, 'POST', crewApi.admin.approve(row.id), {})])
      expect(results.map(result => result.status)).toEqual([200, 200])
      expect(await rowOf(crew, racer)).toMatchObject({ crewStatus: 'approved' })
      expect((await hookNames(racer)).filter(name => name === 'crew:approved')).toHaveLength(1)
      expect((await hookNames(racer)).filter(name => name === 'teams:added')).toHaveLength(1)
      expect((await getEmailsTo(racer.email)).filter(email => email.template?.name === 'crew-status-approved')).toHaveLength(1)

      // Two withdrawals at once: one wins, the other is told it is over or sees it done, and the hook fires once.
      const withdrawals = await Promise.all([json(racer.cookie, 'POST', crewApi.me.withdraw(crew.op.id)), json(racer.cookie, 'POST', crewApi.me.withdraw(crew.op.id))])
      expect(withdrawals.map(result => result.status).sort()).toContain(200)
      expect((await hookNames(racer)).filter(name => name === 'crew:withdrawn')).toHaveLength(1)
    })

    it('never overfills the crew when several places free up at once', async () => {
      const crew = await newCrew({ capacity: 2, waitlist: true })
      const people = [await user('Pa'), await user('Pb'), await user('Pc'), await user('Pd'), await user('Pe')] as Session[]
      const rows = []
      for (const person of people.slice(0, 2)) rows.push(await applied(person, crew))
      for (const row of rows) await approve(row)
      for (const person of people.slice(2)) await ok(await apply(person, crew))
      await Promise.all(people.slice(0, 2).map(person => json(person.cookie, 'POST', crewApi.me.withdraw(crew.op.id))))
      const members = (await list(staff.cookie, crew)).items as Json[]
      expect(members.filter(member => member.crewStatus === 'approved')).toHaveLength(2)
      expect(members.filter(member => member.crewStatus === 'waitlisted')).toHaveLength(1)
      expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.settings(crew.op.id)))).approved).toBe(2)
    })
  })

  describe('races', () => {
    const race = (body: Json) => $fetch('/api/test/race', { method: 'POST', body })

    it('fills a free place when two promotions both put their claim back', async () => {
      const crew = await newCrew({ capacity: 2, waitlist: true })
      const [first, second, third, fourth] = [await user('Racefirst'), await user('Racesecond'), await user('Racethird'), await user('Racefourth')] as [Session, Session, Session, Session]
      const firstRow = await approve(await applied(first, crew))
      await approve(await applied(second, crew))
      const thirdRow = await applied(third, crew)
      const fourthRow = await applied(fourth, crew)
      expect([thirdRow.crewStatus, fourthRow.crewStatus]).toEqual(['waitlisted', 'waitlisted'])

      // Another request claims the fourth person while this one claims the third, and both see the crew overfull.
      await race({ kind: 'promote', otherId: fourthRow.id })
      try {
        await reject(firstRow)
      }
      finally {
        await race({ clear: true })
      }

      // The place is filled after all: this request read the count again after putting its claim back.
      expect(await rowOf(crew, third)).toMatchObject({ crewStatus: 'approved' })
      expect(await rowOf(crew, fourth)).toMatchObject({ crewStatus: 'waitlisted' })
      expect((await list(staff.cookie, crew, '&status=approved')).total).toBe(2)
    })

    it('answers 409 when a move meets a membership added meanwhile', async () => {
      const crew = await newCrew()
      const other = await createTeam(crew)
      const mover = await user('Mover')
      const row = await approve(await applied(mover, crew))
      await race({ kind: 'move' })
      try {
        await expectApiError(json(staff.cookie, 'PATCH', crewApi.admin.member(row.id), { teamId: other.id }), 409, 'conflict')
      }
      finally {
        await race({ clear: true })
      }
      // Nothing changed: still on the first team, and the added row was rolled back with the failed move.
      expect(await rowOf(crew, mover)).toMatchObject({ id: row.id, teamId: crew.teamId, crewStatus: 'approved' })
      expect(await ok(await json(staff.cookie, 'PATCH', crewApi.admin.member(row.id), { teamId: other.id }))).toMatchObject({ teamId: other.id })
    })

    it('reads the live row when a person has a withdrawn one too', async () => {
      const crew = await newCrew()
      const barB = await createTeam(crew, 'Bar B')
      const both = await user('Bothrows')
      // A crew row on the default team, then a pending row teams staff added by hand on another team.
      await applied(both, crew)
      // The database keeps whole seconds: the crew row is the older one.
      await sleep(1_100)
      await ok(await json(staff.cookie, 'POST', teamsApi.admin.members(barB.id), { userId: both.id, role: 'volunteer', status: 'pending' }))
      const created = await ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: barB.id, role: 'bartender' }))
      // The invite fills the row on its own team and withdraws the older crew row.
      expect(await ok(await json(both.cookie, 'POST', crewApi.acceptInvite(created.token)))).toMatchObject({ crewStatus: 'approved', teamId: barB.id })

      const mine = await ok(await json(both.cookie, 'GET', crewApi.me.crew)) as unknown as Json[]
      expect(mine).toContainEqual(expect.objectContaining({ operationId: crew.op.id, crewStatus: 'approved', teamId: barB.id }))
      expect(await ok(await json(both.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ crewStatus: 'approved' })
      // Withdrawing takes the live row off the crew.
      expect(await ok(await json(both.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))).toMatchObject({ crewStatus: 'withdrawn', teamId: barB.id })
    })
  })

  describe('private operations', () => {
    it('answers 404 for a private operation and registers nobody who may not read it', async () => {
      const crew = await newCrew({}, { public: false })
      const outsider = await user('Outsider')
      await expectApiError(json(outsider.cookie, 'GET', crewApi.apply(crew.op.slug)), 404)
      await expectApiError(json(outsider.cookie, 'GET', crewApi.apply(crew.op.id)), 404)
      // The form is still submittable through the forms API, but nothing is registered.
      await ok(await apply(outsider, crew))
      expect(await ok(await json(outsider.cookie, 'GET', crewApi.me.crew))).toEqual([])
      expect((await list(staff.cookie, crew)).items).toEqual([])
      // Staff may read it, and so may somebody who takes part already.
      expect(await ok(await json(staff.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ state: 'open' })
      const insider = await user('Insider')
      const created = await ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'bartender' }))
      await ok(await json(insider.cookie, 'POST', crewApi.acceptInvite(created.token)))
      expect(await ok(await json(insider.cookie, 'GET', crewApi.apply(crew.op.slug)))).toMatchObject({ state: 'applied', crewStatus: 'approved' })
    })
  })

  describe('redelivery', () => {
    it('ignores a submission that was delivered already, and keeps the first phone number', async () => {
      const crew = await newCrew()
      const rob = await user('Rob')
      const row = await applied(rob, crew, { phone: '+15550100103' })
      const before = (await hookNames(rob)).length
      // Forms' own redelivery runs `forms:submitted` again for the stored submission.
      await ok(await json(staff.cookie, 'POST', formsApi.admin.redeliver(row.submissionId)))
      expect(await hookNames(rob)).toHaveLength(before)
      expect(await getEmailsTo(rob.email)).toHaveLength(1)
      expect(await rowOf(crew, rob)).toMatchObject({ id: row.id, submissionId: row.submissionId, phone: '+15550100103' })
      // A second application of somebody already in does not overwrite their phone number either.
      await ok(await apply(rob, crew, { phone: '+15550100104' }))
      expect(await rowOf(crew, rob)).toMatchObject({ phone: '+15550100103' })
    })

    it('stores the phone number only under the users rule (at most 40 digits, spaces and +-().)', async () => {
      const crew = await newCrew()
      // Forms accepts both; users does not: too long, and a `+` that does not lead.
      const long = await user('Longphone')
      expect(await applied(long, crew, { phone: '1'.repeat(45) })).toMatchObject({ phone: null })
      const inner = await user('Innerplus')
      expect(await applied(inner, crew, { phone: '555+0100' })).toMatchObject({ phone: null })
      const fine = await user('Finephone')
      expect(await applied(fine, crew, { phone: ' +45 (12) 34-56 78 ' })).toMatchObject({ phone: '+45 (12) 34-56 78' })
    })

    it('ignores an old submission redelivered after the person withdrew', async () => {
      const crew = await newCrew()
      const sue = await user('Sue')
      const first = await ok(await apply(sue, crew))
      await new Promise(resolve => setTimeout(resolve, 1_200))
      // A second submission replaces the first on the row, so the first is no longer the stored one.
      await ok(await apply(sue, crew, { motivation: 'second' }))
      await ok(await json(sue.cookie, 'POST', crewApi.me.withdraw(crew.op.id)))
      await ok(await json(staff.cookie, 'POST', formsApi.admin.redeliver(first.id)))
      expect(await rowOf(crew, sue)).toMatchObject({ crewStatus: 'withdrawn' })
    })
  })

  describe('presets are added once', () => {
    it('never re-adds a rule staff removed, and a later save adds none', async () => {
      const crew = await newCrew()
      const url = `${teamsApi.admin.mappings}?ownerType=operation&ownerId=${crew.op.id}`
      const rules = await ok(await json(staff.cookie, 'GET', url)) as unknown as Json[]
      expect(rules).toHaveLength(3)
      const supervisor = rules.find(rule => rule.match.role === 'supervisor')!
      expect((await json(staff.cookie, 'DELETE', teamsApi.admin.mapping(supervisor.id))).status).toBe(204)
      await ok(await saveSettings(crew.op.id, { formId: crew.form.id, capacity: 3 }))
      expect(((await ok(await json(staff.cookie, 'GET', url))) as unknown as Json[]).map(rule => rule.match.role ?? rule.match.plan).sort()).toEqual(['crew', 'member-plan'])

      // Presets switched on later add nothing; switched off later remove nothing.
      const off = await newCrew({ presets: false })
      expect(await ok(await saveSettings(off.op.id, { formId: off.form.id, presets: true }))).toMatchObject({ presets: false })
      expect(await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.mappings}?ownerType=operation&ownerId=${off.op.id}`))).toEqual([])
      const on = await newCrew()
      await ok(await saveSettings(on.op.id, { formId: on.form.id, presets: false }))
      expect(((await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.mappings}?ownerType=operation&ownerId=${on.op.id}`))) as unknown as Json[])).toHaveLength(3)
    })

    it('does not re-add a preset whose rule staff changed to another role', async () => {
      const crew = await newCrew()
      const url = `${teamsApi.admin.mappings}?ownerType=operation&ownerId=${crew.op.id}`
      const rule = ((await ok(await json(staff.cookie, 'GET', url))) as unknown as Json[]).find(item => item.match.role === 'crew')!
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.mapping(rule.id), { teamRole: 'volunteer' }))
      await ok(await saveSettings(crew.op.id, { formId: crew.form.id }))
      const after = (await ok(await json(staff.cookie, 'GET', url))) as unknown as Json[]
      expect(after).toHaveLength(3)
      expect(after.find(item => item.match.role === 'crew')).toMatchObject({ teamRole: 'volunteer' })
    })
  })

  describe('email language', () => {
    const texts = { subject: { en: 'English {{name}}', da: 'Dansk {{name}}' } }

    it('sends every status email in the language of the application', async () => {
      const crew = await newCrew({ statusEmails: { applied: texts, approved: texts } })
      const dane = await user('Dane')
      const english = await user('Brit')
      await ok(await json(dane.cookie, 'POST', formsApi.submit(crew.form.slug), { answers: { name: 'Dane' }, locale: 'da-DK' }))
      await ok(await json(english.cookie, 'POST', formsApi.submit(crew.form.slug), { answers: { name: 'Brit' }, locale: 'en' }))
      await approve(await rowOf(crew, dane))
      expect((await getEmailsTo(dane.email)).map(email => [email.template?.name, email.template?.locale, email.subject])).toEqual([
        ['crew-status-applied', 'da', 'Dansk Dane'],
        ['crew-status-approved', 'da', 'Dansk Dane'],
      ])
      expect((await getEmailsTo(english.email))[0]).toMatchObject({ subject: 'English Brit', template: { locale: 'en' } })
    })

    it('writes the built-in texts, the status, the greeting and the template\'s texts in Danish', async () => {
      const crew = await newCrew({ statusEmails: { approved: { body: { da: 'Status: {{status}}', en: 'Status: {{status}}' } } } })
      const dane = await user('Dansker')
      await ok(await json(dane.cookie, 'POST', formsApi.submit(crew.form.slug), { answers: { name: 'Dansker' }, locale: 'da-DK' }))
      await approve(await rowOf(crew, dane))
      const [appliedEmail, approvedEmail] = await getEmailsTo(dane.email)
      expect(appliedEmail).toMatchObject({
        subject: `Vi har modtaget din ansøgning til ${crew.op.name.en}`,
        template: { name: 'crew-status-applied', locale: 'da', props: { heading: 'Vi har modtaget din ansøgning', button: 'Se din ansøgning', greeting: expect.stringMatching(/^Hej /) } },
      })
      expect(appliedEmail!.text).toMatch(/^Hej /)
      expect(appliedEmail!.text).toContain('Tak for din ansøgning.')
      // `{{status}}` is the Danish label.
      expect(approvedEmail).toMatchObject({ subject: `Du er med i crewet på ${crew.op.name.en}`, template: { props: { message: 'Status: Godkendt' } } })
      // The fixture has no i18n, so the link has no locale prefix (`localizePath` of module-kit is unit-tested).
      expect(appliedEmail!.template!.props!.statusUrl).toMatch(/^http.*\/crew\/status$/)
      const brit = await user('Englishman')
      await ok(await json(brit.cookie, 'POST', formsApi.submit(crew.form.slug), { answers: { name: 'Englishman' }, locale: 'en' }))
      const [english] = await getEmailsTo(brit.email)
      expect(english).toMatchObject({ subject: `We received your application for ${crew.op.name.en}`, template: { props: { heading: 'We received your application' } } })
    })

    it('sends the invite email in the language of the request that accepted it', async () => {
      const crew = await newCrew({ statusEmails: { approved: texts } })
      const created = await ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'bartender' }))
      const hans = await user('Hans')
      const response = await fetch(crewApi.acceptInvite(created.token), { method: 'POST', headers: { 'cookie': hans.cookie, 'accept-language': 'da-DK,da;q=0.9,en;q=0.8' } })
      expect(response.status, await response.clone().text()).toBeLessThan(300)
      expect((await getEmailsTo(hans.email))[0]).toMatchObject({ subject: 'Dansk Hans', template: { locale: 'da' } })
    })
  })

  describe('forms to recruit with (query)', () => {
    it('validates the query', async () => {
      await expectApiError(json(staff.cookie, 'GET', `${crewApi.admin.forms}?operationId=${'x'.repeat(65)}`), 400)
      expect(await ok(await json(staff.cookie, 'GET', `${crewApi.admin.forms}?operationId=`))).toBeDefined()
    })
  })

  describe('forms to recruit with', () => {
    it('lists only the forms an operation can use, and keeps its own', async () => {
      const crew = await newCrew()
      const other = await newCrew()
      const open = await createForm({ ...FORM_DEFINITION, access: { availability: 'web', auth: 'none' } })
      const unstored = await createForm({ ...FORM_DEFINITION, storage: 'none' })
      const fresh = await createForm()
      const ids = async (query: string) => ((await ok(await json(staff.cookie, 'GET', `${crewApi.admin.forms}${query}`))) as unknown as Json[]).map(form => form.id)

      const forOther = await ids(`?operationId=${other.op.id}`)
      expect(forOther).toContain(fresh.id)
      expect(forOther).toContain(other.form.id)
      expect(forOther).not.toContain(crew.form.id)
      expect(forOther).not.toContain(open.id)
      expect(forOther).not.toContain(unstored.id)
      // Without an operation, forms in use are not offered.
      expect(await ids('')).not.toContain(other.form.id)
      expect(await ids('')).toContain(fresh.id)
      expect((await json((await user('Nobody')).cookie, 'GET', crewApi.admin.forms)).status).toBe(403)
    })
  })

  describe('invite rules', () => {
    it('refuses somebody approved anywhere in the operation, and a rejected applicant', async () => {
      const crew = await newCrew()
      const bar = await createTeam(crew, 'Bar C')
      const [approvedPerson, rejectedPerson] = [await user('Already'), await user('Turned')] as [Session, Session]
      await approve(await applied(approvedPerson, crew))
      await reject(await applied(rejectedPerson, crew))
      const created = await ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: bar.id, role: 'lead', maxUses: 5 }))
      await expectApiError(json(approvedPerson.cookie, 'POST', crewApi.acceptInvite(created.token)), 409, 'crew_already_member')
      await expectApiError(json(rejectedPerson.cookie, 'POST', crewApi.acceptInvite(created.token)), 409, 'crew_rejected')
      expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[])[0]).toMatchObject({ uses: 0 })
      expect(await rowOf(crew, rejectedPerson)).toMatchObject({ crewStatus: 'rejected' })
      expect(await rowOf(crew, approvedPerson)).toMatchObject({ teamId: crew.teamId })
    })

    it('keeps the use spent when a hook listener fails after the membership was written', async () => {
      const crew = await newCrew()
      const created = await ok(await json(staff.cookie, 'POST', crewApi.admin.invites(crew.op.id), { teamId: crew.teamId, role: 'lead', maxUses: 2 }))
      const failing = await registerUser('Failing', `hookfail${++counter}@example.com`)
      const response = await json(failing.cookie, 'POST', crewApi.acceptInvite(created.token))
      expect(response.status).toBe(500)
      expect(await rowOf(crew, failing)).toMatchObject({ crewStatus: 'approved', role: 'lead' })
      expect((await ok(await json(staff.cookie, 'GET', crewApi.admin.invites(crew.op.id))) as unknown as Json[])[0]).toMatchObject({ uses: 1 })
    })
  })

  describe('home page', () => {
    it('renders the crew.home dashboard at /crew, guarded for signed-in people', async () => {
      const tess = await user('Hometess')
      const html = await $fetch<string>('/crew', { headers: { cookie: tess.cookie } })
      expect(html).toContain('data-dashboard="crew.home"')
      // `guardPages` marks the page for `@frigear-nu/authorization` (which enforces it); the fixture has no
      // Authorization, so the rule is checked as config.
      const rules = await $fetch<Record<string, { authenticated?: boolean }>>('/api/test/route-rules')
      expect(rules['/crew']).toMatchObject({ authenticated: true })
      expect(rules['/crew/status']).toBeUndefined()
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
        ['GET', crewApi.member(row.id)],
        ['GET', crewApi.members(crew.op.id)],
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
      await expectApiError(json(nobody.cookie, 'PATCH', crewApi.admin.member(row.id), { role: 'lead' }), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'DELETE', crewApi.admin.invite('civ_missing')), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'GET', crewApi.admin.members(crew.op.id)), 403, 'forbidden')
      expect((await scoped(nobody.cookie, crew)).items).toEqual([])
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
