import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { operationsApi } from '@frigear-nu/operations/api'
import { teamsApi } from '@frigear-nu/teams/api'
import { shiftsApi } from '../src/runtime/utils/api'
import { getEmailsTo, getHooks, registerUser } from './helpers'

type Session = Awaited<ReturnType<typeof registerUser>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON responses
type Json = Record<string, any>

const json = (cookie: string | undefined, method: ApiMethod, path: string, body?: unknown) => apiClient({ cookie }).fetch(method, path, body)
const ok = async (response: Response) => {
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return response.status === 204 ? {} as Json : response.json() as Promise<Json>
}

let counter = 0
const HOUR = 3_600_000
const iso = (offset: number) => new Date(Date.now() + offset).toISOString()

async function createToken(cookie: string, scopes: string[]) {
  const response = await fetch(authApi.me.tokens, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'test', scopes }),
  })
  expect(response.status, await response.clone().text()).toBeLessThan(300)
  return (await response.json() as { token: string }).token
}

describe('shifts (authenticated, database-backed)', async () => {
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

  // --- Fixtures through the real routes: operations, teams (members added by hand hold an explicit role) -------------
  const createOperation = async (): Promise<Json> => ok(await json(staff.cookie, 'POST', operationsApi.admin.operations, {
    slug: `operation-${++counter}`,
    name: { en: `Operation ${counter}` },
    startsAt: '2027-06-27T10:00:00.000Z',
    public: false,
  }))
  const createTeam = async (operationId: string, name = `Bar ${++counter}`): Promise<Json> => ok(await json(staff.cookie, 'POST', teamsApi.admin.teams, {
    ownerType: 'operation',
    ownerId: operationId,
    kind: 'bar',
    name,
  }))
  const addMember = async (teamId: string, who: Session, role = 'volunteer') => ok(await json(staff.cookie, 'POST', teamsApi.admin.members(teamId), { userId: who.id, role }))
  const createSchedule = async (operationId: string, body: Json = {}): Promise<Json> => ok(await json(staff.cookie, 'POST', shiftsApi.admin.schedules, {
    operationId,
    name: { en: `Schedule ${++counter}` },
    ...body,
  }))
  const bulk = async (scheduleId: string, body: Json): Promise<Json[]> => ok(await json(staff.cookie, 'POST', shiftsApi.admin.bulk(scheduleId), body)) as unknown as Promise<Json[]>
  const publish = async (scheduleId: string) => ok(await json(staff.cookie, 'POST', shiftsApi.admin.publish(scheduleId)))
  const assign = (shiftId: string, who: Session, body: Json = {}) => json(staff.cookie, 'POST', shiftsApi.admin.assignments(shiftId), { userId: who.id, ...body })
  const assigned = async (shiftId: string, who: Session, body: Json = {}): Promise<Json> => ok(await assign(shiftId, who, body))
  const patchShift = async (shiftId: string, body: Json) => ok(await json(staff.cookie, 'PATCH', shiftsApi.admin.shift(shiftId), body))
  const myShifts = async (who: Session): Promise<Json[]> => ok(await json(who.cookie, 'GET', shiftsApi.me.shifts)) as unknown as Promise<Json[]>
  const assignmentOf = async (who: Session, shiftId: string): Promise<Json | undefined> => (await myShifts(who)).find(item => item.shift.id === shiftId)

  type Setup = { op: Json, team: Json, schedule: Json, shifts: Json[] }
  /** An operation with a team and a schedule of two shifts on one day in 2027 (10:00–14:00 and 18:00–22:00 local). */
  async function newSetup(schedule: Json = {}, options: { publish?: boolean } = {}): Promise<Setup> {
    const op = await createOperation()
    const team = await createTeam(op.id)
    const created = await createSchedule(op.id, schedule)
    const shifts = await bulk(created.id, { teamId: team.id, days: ['2027-06-28'], slots: [{ start: '10:00', end: '14:00' }, { start: '18:00', end: '22:00' }] })
    if (options.publish !== false) await publish(created.id)
    return { op, team, schedule: created, shifts }
  }

  describe('schedules and shifts', () => {
    it('creates shifts in bulk at the local times of the time zone, night slots ending the next day', async () => {
      const op = await createOperation()
      const team = await createTeam(op.id)
      const schedule = await createSchedule(op.id)
      expect(schedule).toMatchObject({ status: 'draft', coverage: 'flexible', handover: 'both', approval: 'peer', operationId: op.id })
      const created = await bulk(schedule.id, { teamId: team.id, days: ['2027-01-15', '2027-06-28'], slots: [{ start: '10:00', end: '16:00' }, { start: '22:00', end: '04:00' }] })
      expect(created.map(shift => [shift.startsAt, shift.endsAt])).toEqual([
        ['2027-01-15T09:00:00.000Z', '2027-01-15T15:00:00.000Z'],
        ['2027-01-15T21:00:00.000Z', '2027-01-16T03:00:00.000Z'],
        ['2027-06-28T08:00:00.000Z', '2027-06-28T14:00:00.000Z'],
        ['2027-06-28T20:00:00.000Z', '2027-06-29T02:00:00.000Z'],
      ])
      const hooks = (await getHooks()).filter(hook => hook.name === 'shift:created' && hook.scheduleId === schedule.id)
      expect(hooks).toHaveLength(4)
      // A team of another operation is refused.
      const other = await createTeam((await createOperation()).id)
      expect((await json(staff.cookie, 'POST', shiftsApi.admin.bulk(schedule.id), { teamId: other.id, days: ['2027-06-28'], slots: [{ start: '10:00', end: '12:00' }] })).status).toBe(400)
      // Only staff manage schedules.
      const volunteer = await user('Vera')
      expect((await json(volunteer.cookie, 'POST', shiftsApi.admin.schedules, { operationId: op.id, name: 'x' })).status).toBe(403)
    })

    it('copies roles and shifts from another schedule, moved by days, and maps teams of another operation by name', async () => {
      const source = await newSetup({}, { publish: false })
      await ok(await json(staff.cookie, 'POST', shiftsApi.admin.roles(source.schedule.id), { teamId: source.team.id, teamRole: 'ba', name: { en: 'BA' } }))
      const sameOp = await createSchedule(source.op.id)
      const copied = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.copyFrom(sameOp.id), { scheduleId: source.schedule.id, offsetDays: 7 }))
      expect(copied).toMatchObject({ roles: 1, shifts: 2, skippedTeamIds: [] })
      const shifts = await ok(await json(staff.cookie, 'GET', shiftsApi.admin.shifts(sameOp.id))) as unknown as Json[]
      expect(shifts.map(shift => shift.startsAt)).toEqual(['2027-07-05T08:00:00.000Z', '2027-07-05T16:00:00.000Z'])
      expect(shifts.every(shift => shift.assignees.length === 0)).toBe(true)

      // Another operation: the team "Bar" maps by name, an unmatched team is skipped.
      const next = await createOperation()
      await createTeam(next.id, source.team.name.en ?? source.team.name)
      const lonely = await createTeam(source.op.id, `Lonely ${++counter}`)
      await bulk(source.schedule.id, { teamId: lonely.id, days: ['2027-06-29'], slots: [{ start: '10:00', end: '12:00' }] })
      const target = await createSchedule(next.id)
      const across = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.copyFrom(target.id), { scheduleId: source.schedule.id, offsetDays: 364 }))
      expect(across).toMatchObject({ roles: 1, shifts: 2, skippedTeamIds: [lonely.id] })
    })

    it('keeps drafts from volunteers and shows published schedules', async () => {
      const setup = await newSetup({}, { publish: false })
      const ann = await user('Ann')
      await addMember(setup.team.id, ann)
      const result = await assigned(setup.shifts[0]!.id, ann)
      expect(await myShifts(ann)).toEqual([])
      expect((await json(ann.cookie, 'GET', shiftsApi.me.shift(result.assignment.id))).status).toBe(404)

      await publish(setup.schedule.id)
      // Publishing again is a no-op and fires once.
      await publish(setup.schedule.id)
      expect((await getHooks()).filter(hook => hook.name === 'schedule:published' && hook.scheduleId === setup.schedule.id)).toHaveLength(1)
      const mine = await myShifts(ann)
      expect(mine).toHaveLength(1)
      expect(mine[0]).toMatchObject({ shift: { id: setup.shifts[0]!.id }, assignment: { status: 'assigned', userId: ann.id }, operationId: setup.op.id, swap: null })
      expect(mine[0]!.assignment.checkInCode).toBeUndefined()
      const detail = await ok(await json(ann.cookie, 'GET', shiftsApi.me.shift(result.assignment.id)))
      expect(detail).toMatchObject({ settings: { coverage: 'flexible', handover: 'both', approval: 'peer' }, swapDetail: null, leadsOnDuty: [] })
      // Somebody else's assignment is not found under my own routes.
      const bo = await user('Bo')
      expect((await json(bo.cookie, 'GET', shiftsApi.me.shift(result.assignment.id))).status).toBe(404)
    })
  })

  describe('assignment', () => {
    it('needs an explicit role on the team that meets the shift role; mapped-only people are not assignable', async () => {
      const setup = await newSetup()
      const role = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.roles(setup.schedule.id), { teamId: setup.team.id, teamRole: 'ba', name: 'BA' }))
      const outsider = await user('Out')
      await expectApiError(assign(setup.shifts[0]!.id, outsider), 409, 'not_eligible')

      const volunteer = await user('Vol')
      await addMember(setup.team.id, volunteer, 'volunteer')
      await ok(await assign(setup.shifts[0]!.id, volunteer))
      const low = await assign(setup.shifts[1]!.id, volunteer, { shiftRoleId: role.id })
      await expectApiError(Promise.resolve(low), 409, 'not_eligible')

      const lead = await user('Lead')
      await addMember(setup.team.id, lead, 'ba')
      expect((await assigned(setup.shifts[1]!.id, lead, { shiftRoleId: role.id })).assignment).toMatchObject({ shiftRoleId: role.id, status: 'assigned' })

      // A global barmanager is a mapped BA on the team through a rule, without a membership row: not assignable.
      await ok(await json(staff.cookie, 'POST', teamsApi.admin.mappings, { ownerType: 'operation', ownerId: setup.op.id, teamId: setup.team.id, match: { role: 'barmanager' }, teamRole: 'ba' }))
      const mapped = await user('Mapped', 'bar.test')
      await expectApiError(assign(setup.shifts[1]!.id, mapped), 409, 'not_eligible')
      // Twice on the same shift is refused.
      await expectApiError(assign(setup.shifts[0]!.id, volunteer), 409, 'already_assigned')
      // The candidates list shows the members with their eligibility.
      const candidates = await ok(await json(staff.cookie, 'GET', `${shiftsApi.admin.candidates(setup.shifts[1]!.id)}`)) as unknown as Json[]
      expect(candidates.map(item => item.userId).sort()).toEqual([volunteer.id, lead.id].sort())
      expect(candidates.find(item => item.userId === lead.id)).toMatchObject({ eligible: false, reason: 'assigned' })
    })

    it('refuses a full shift unless forced, and never overfills it when two assign at once', async () => {
      const setup = await newSetup({ maxPerShift: 1 })
      const [a, b, c, d] = await Promise.all([user('Ca'), user('Cb'), user('Cc'), user('Cd')])
      for (const who of [a, b, c, d]) await addMember(setup.team.id, who)
      await assigned(setup.shifts[0]!.id, a)
      await expectApiError(assign(setup.shifts[0]!.id, b), 409, 'shift_full')
      const forced = await assigned(setup.shifts[0]!.id, b, { force: true })
      expect(forced.warnings.map((warning: Json) => warning.code)).toContain('shift_full')

      const results = await Promise.all([assign(setup.shifts[1]!.id, c), assign(setup.shifts[1]!.id, d)])
      expect(results.map(response => response.status).sort()).toEqual([201, 409])
      const shifts = await ok(await json(staff.cookie, 'GET', shiftsApi.admin.shifts(setup.schedule.id))) as unknown as Json[]
      expect(shifts.find(shift => shift.id === setup.shifts[1]!.id)!.filled).toBe(1)
    })

    it('answers the guards as warnings to staff', async () => {
      const setup = await newSetup({ guards: { maxShiftsPerDay: 1, minRestHours: 6 }, minPerShift: 2 })
      const ann = await user('Gann')
      await addMember(setup.team.id, ann)
      const first = await assigned(setup.shifts[0]!.id, ann)
      expect(first.warnings.map((warning: Json) => warning.code)).toEqual(['below_min'])
      const second = await assigned(setup.shifts[1]!.id, ann)
      expect(second.warnings.map((warning: Json) => warning.code).sort()).toEqual(['below_min', 'max_shifts_per_day', 'min_rest'])
      // An overlapping shift always warns.
      const [overlap] = await bulk(setup.schedule.id, { teamId: setup.team.id, days: ['2027-06-28'], slots: [{ start: '12:00', end: '15:00' }] })
      expect((await assigned(overlap!.id, ann)).warnings.map((warning: Json) => warning.code)).toContain('overlap')
      expect((await getHooks()).filter(hook => hook.name === 'assignment:changed' && hook.userId === ann.id && hook.previousStatus === null)).toHaveLength(3)
    })
  })

  describe('swaps', () => {
    it('trades between volunteers: every offer gives a shift back, accepting one completes and supersedes the rest', async () => {
      const setup = await newSetup()
      const [ann, bo, cy] = await Promise.all([user('Ann'), user('Bo'), user('Cy')])
      for (const who of [ann, bo, cy]) await addMember(setup.team.id, who)
      const [cyDay] = await bulk(setup.schedule.id, { teamId: setup.team.id, days: ['2027-07-01'], slots: [{ start: '10:00', end: '14:00' }] })
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const boShift = await assigned(setup.shifts[1]!.id, bo)
      const cyShift = await assigned(cyDay!.id, cy)

      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id), { kind: 'trade' }))
      expect(swap).toMatchObject({ status: 'open', kind: 'trade', assignmentId: annShift.assignment.id, owner: { userId: ann.id }, wantedAssignmentId: null })
      // Opening again answers the same swap.
      expect((await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))).id).toBe(swap.id)
      // The owner does not see their own swap in the marketplace; Bo and Cy do.
      expect((await ok(await json(ann.cookie, 'GET', shiftsApi.swaps)) as unknown as Json[]).find(item => item.id === swap.id)).toBeUndefined()
      expect((await ok(await json(bo.cookie, 'GET', shiftsApi.swaps)) as unknown as Json[]).find(item => item.id === swap.id)).toMatchObject({ myOffer: null })

      const boOffer = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: boShift.assignment.id }))
      expect(boOffer).toMatchObject({ status: 'offered', userId: bo.id, offeredAssignmentId: boShift.assignment.id })
      await expectApiError(json(bo.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: boShift.assignment.id }), 409, 'offer_exists')
      // Offering somebody else's assignment is not found; a trade without a shift in return is refused.
      await expectApiError(json(cy.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: boShift.assignment.id }), 404)
      await expectApiError(json(cy.cookie, 'POST', shiftsApi.offers(swap.id), {}), 409, 'handover_not_allowed')
      const cyOffer = await ok(await json(cy.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: cyShift.assignment.id }))
      const offered = (await getEmailsTo(ann.email)).filter(email => email.template?.name === 'shifts-swap-offered')
      expect(offered).toHaveLength(2)
      // A trade email names both shifts.
      expect(offered[0]!.template!.props).toMatchObject({ trade: true })
      expect(offered[0]!.text).toMatch(/their shift on .+ for your shift on /)

      // Only the owner accepts.
      expect((await json(cy.cookie, 'POST', shiftsApi.acceptOffer(swap.id, boOffer.id))).status).toBe(403)
      const done = await ok(await json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, boOffer.id)))
      expect(done).toMatchObject({ status: 'completed' })
      expect(done.offers.find((offer: Json) => offer.id === cyOffer.id)).toMatchObject({ status: 'superseded' })

      // The two shifts changed hands.
      expect(await assignmentOf(ann, setup.shifts[1]!.id)).toMatchObject({ assignment: { id: boShift.assignment.id } })
      expect(await assignmentOf(bo, setup.shifts[0]!.id)).toMatchObject({ assignment: { id: annShift.assignment.id } })
      expect(await assignmentOf(ann, setup.shifts[0]!.id)).toBeUndefined()
      const hooks = (await getHooks()).filter(hook => hook.swapId === swap.id)
      expect(hooks.map(hook => hook.name)).toEqual(['swap:offered', 'swap:offered', 'swap:accepted', 'swap:completed'])
      expect(hooks.every(hook => hook.kind === 'trade')).toBe(true)
      // Each person holds as many shifts as before.
      expect((await myShifts(ann)).length).toBe(1)
      expect((await myShifts(bo)).length).toBe(1)
      expect((await myShifts(cy)).length).toBe(1)
      const moves = (await getHooks()).filter(hook => hook.name === 'assignment:changed' && (hook.assignmentId === annShift.assignment.id || hook.assignmentId === boShift.assignment.id) && hook.previousUserId !== null && hook.previousUserId !== hook.userId)
      expect(moves.map(hook => [hook.previousUserId, hook.userId])).toEqual([[ann.id, bo.id], [bo.id, ann.id]])
      // Peer mode: only the completed email, no separate "accepted" one; no site origin is configured, so no link.
      const boEmails = (await getEmailsTo(bo.email)).map(email => email.template?.name)
      expect(boEmails).toContain('shifts-swap-completed')
      expect(boEmails).not.toContain('shifts-swap-accepted')
      expect((await getEmailsTo(ann.email)).find(email => email.template?.name === 'shifts-swap-offered')!.template!.props!.url).toBeNull()
      expect((await getEmailsTo(ann.email)).map(email => email.template?.name)).toContain('shifts-swap-completed')
    })

    it('hands a released shift over, and lets the owner reject and withdraw', async () => {
      const setup = await newSetup()
      const [ann, bo, cy] = await Promise.all([user('Han'), user('Hbo'), user('Hcy')])
      for (const who of [ann, bo, cy]) await addMember(setup.team.id, who)
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const boShift = await assigned(setup.shifts[1]!.id, bo)
      // `handover: 'both'`: a swap opened without a kind is a release.
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
      expect(swap).toMatchObject({ kind: 'release' })
      // A release takes nothing in return.
      await expectApiError(json(bo.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: boShift.assignment.id }), 400)
      const boOffer = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      await ok(await json(ann.cookie, 'POST', shiftsApi.rejectOffer(swap.id, boOffer.id)))
      expect((await getEmailsTo(bo.email)).map(email => email.template?.name)).toContain('shifts-swap-rejected')
      // With no offer waiting the swap is open again.
      expect((await ok(await json(ann.cookie, 'GET', shiftsApi.me.shift(annShift.assignment.id)))).swapDetail).toMatchObject({ status: 'open' })
      const cyOffer = await ok(await json(cy.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      // The offerer withdraws, then offers again.
      await ok(await json(cy.cookie, 'DELETE', shiftsApi.offer(swap.id, cyOffer.id)))
      expect((await json(bo.cookie, 'DELETE', shiftsApi.offer(swap.id, cyOffer.id))).status).toBe(403)
      const again = await ok(await json(cy.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      await ok(await json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, again.id)))
      expect(await assignmentOf(cy, setup.shifts[0]!.id)).toMatchObject({ assignment: { id: annShift.assignment.id, status: 'assigned' } })
      expect(await myShifts(ann)).toEqual([])

      // Withdrawing a swap cancels it.
      const cyAssignment = (await assignmentOf(cy, setup.shifts[0]!.id))!
      const second = await ok(await json(cy.cookie, 'POST', shiftsApi.me.swap(cyAssignment.assignment.id)))
      await ok(await json(cy.cookie, 'DELETE', shiftsApi.me.swap(cyAssignment.assignment.id)))
      await expectApiError(json(bo.cookie, 'POST', shiftsApi.offers(second.id), {}), 409, 'swap_closed')
    })

    it('waits for a lead or staff with approval "lead"', async () => {
      const setup = await newSetup({ approval: 'lead' })
      const [ann, bo, lead] = await Promise.all([user('Aan'), user('Abo'), user('Alead')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, bo)
      await addMember(setup.team.id, lead, 'ba')
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
      const offer = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      const pending = await ok(await json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))
      expect(pending).toMatchObject({ status: 'pending_approval' })
      expect((await getEmailsTo(lead.email)).map(email => email.template?.name)).toContain('shifts-swap-pending')
      // Nothing moved yet.
      expect(await assignmentOf(ann, setup.shifts[0]!.id)).toBeDefined()

      // A volunteer cannot approve; the lead rejects: the swap is open again and the offer rejected.
      expect((await json(bo.cookie, 'POST', shiftsApi.approveSwap(swap.id))).status).toBe(403)
      const reopened = await ok(await json(lead.cookie, 'POST', shiftsApi.rejectSwap(swap.id)))
      expect(reopened).toMatchObject({ status: 'open' })
      expect(reopened.offers.find((item: Json) => item.id === offer.id)).toMatchObject({ status: 'rejected' })
      expect((await getEmailsTo(ann.email)).map(email => email.template?.name)).toContain('shifts-swap-rejected')

      // Offer again, accept, the lead approves: done.
      const second = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      await ok(await json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, second.id)))
      const approved = await ok(await json(lead.cookie, 'POST', shiftsApi.approveSwap(swap.id)))
      expect(approved).toMatchObject({ status: 'completed' })
      expect(approved.offers.find((item: Json) => item.id === second.id)).toMatchObject({ status: 'accepted', approvedBy: lead.id })
      expect(await assignmentOf(bo, setup.shifts[0]!.id)).toBeDefined()
      // Approving twice is a conflict.
      await expectApiError(json(staff.cookie, 'POST', shiftsApi.approveSwap(swap.id)), 409, 'swap_changed')
    })

    it('allows a swap across teams only when both people are eligible for the other shift', async () => {
      const setup = await newSetup()
      const other = await createTeam(setup.op.id)
      const [otherShift] = await bulk(setup.schedule.id, { teamId: other.id, days: ['2027-06-29'], slots: [{ start: '10:00', end: '14:00' }] })
      const [ann, dan] = await Promise.all([user('Xann'), user('Xdan')])
      await addMember(setup.team.id, ann)
      await addMember(other.id, dan)
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const danShift = await assigned(otherShift!.id, dan)
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id), { kind: 'trade' }))
      // Dan holds no role on Ann's team: the swap is not his to see or take.
      expect((await ok(await json(dan.cookie, 'GET', shiftsApi.swaps)) as unknown as Json[]).find(item => item.id === swap.id)).toBeUndefined()
      await expectApiError(json(dan.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: danShift.assignment.id }), 409, 'guard_ineligible')
      // Dan joins Ann's team, but Ann is not on Dan's: giving Dan's shift back is still refused (the guards run for both).
      await addMember(setup.team.id, dan)
      await expectApiError(json(dan.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: danShift.assignment.id }), 409, 'guard_ineligible')
      // Both on both teams: allowed.
      await addMember(other.id, ann)
      const offer = await ok(await json(dan.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: danShift.assignment.id }))
      await ok(await json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))
      expect(await assignmentOf(ann, otherShift!.id)).toBeDefined()
      expect(await assignmentOf(dan, setup.shifts[0]!.id)).toBeDefined()
    })

    it('refuses a swap that breaks a guard, and completes once when two accepts race', async () => {
      const setup = await newSetup({ guards: { maxShiftsPerDay: 1 } })
      const [ann, bo, cy] = await Promise.all([user('Rann'), user('Rbo'), user('Rcy')])
      for (const who of [ann, bo, cy]) await addMember(setup.team.id, who)
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      // Bo works the evening of the same day: taking Ann's morning would be two shifts that day.
      await assigned(setup.shifts[1]!.id, bo)
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
      await expectApiError(json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {}), 409, 'guard_max_per_day')

      // Two offers, two accepts at once: one carries the swap out.
      const dee = await user('Rdee')
      await addMember(setup.team.id, dee)
      const cyOffer = await ok(await json(cy.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      const deeOffer = await ok(await json(dee.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      const answers = await Promise.all([
        json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, cyOffer.id)),
        json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, deeOffer.id)),
      ])
      expect(answers.map(response => response.status).sort()).toEqual([200, 409])
      const completed = (await getHooks()).filter(hook => hook.name === 'swap:completed' && hook.swapId === swap.id)
      expect(completed).toHaveLength(1)
      const winner = completed[0]!.userId
      expect([cy.id, dee.id]).toContain(winner)
      const mine = await myShifts(winner === cy.id ? cy : dee)
      expect(mine.map(item => item.shift.id)).toEqual([setup.shifts[0]!.id])
    })
  })

  describe('coverage, handover and approval', () => {
    const open = (who: Session, assignmentId: string, body: Json = {}) => json(who.cookie, 'POST', shiftsApi.me.swap(assignmentId), body)
    const offerOn = (who: Session, swapId: string, assignmentId?: string) => json(who.cookie, 'POST', shiftsApi.offers(swapId), assignmentId ? { assignmentId } : {})
    const countOf = async (who: Session) => (await myShifts(who)).length
    /** A setup with Ann on the morning shift and Bo on a shift two days later: a trade that breaks no guard. */
    async function tradeSetup(schedule: Json, lead = false) {
      const setup = await newSetup(schedule)
      const [ann, bo, boss] = await Promise.all([user('Tann'), user('Tbo'), user('Tlead')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, bo)
      if (lead) await addMember(setup.team.id, boss, 'ba')
      const [later] = await bulk(setup.schedule.id, { teamId: setup.team.id, days: ['2027-06-30'], slots: [{ start: '10:00', end: '14:00' }] })
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const boShift = await assigned(later!.id, bo)
      return { ...setup, later: later!, ann, bo, boss, annShift, boShift }
    }

    it('accepts every valid combination and refuses coverage "all" with release or both, on create and on a merged patch', async () => {
      const op = await createOperation()
      for (const [coverage, handover] of [['all', 'trade'], ['flexible', 'trade'], ['flexible', 'release'], ['flexible', 'both']]) {
        expect(await createSchedule(op.id, { coverage, handover, approval: 'lead' })).toMatchObject({ coverage, handover, approval: 'lead' })
      }
      for (const handover of ['release', 'both']) {
        await expectApiError(json(staff.cookie, 'POST', shiftsApi.admin.schedules, { operationId: op.id, name: 'x', coverage: 'all', handover }), 400, 'invalid_schedule_settings')
      }
      // The patch is checked merged with what is stored: `coverage: 'all'` alone on a `both` schedule is refused.
      const schedule = await createSchedule(op.id)
      await expectApiError(json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(schedule.id), { coverage: 'all' }), 400, 'invalid_schedule_settings')
      const roskilde = await ok(await json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(schedule.id), { coverage: 'all', handover: 'trade', approval: 'lead' }))
      expect(roskilde).toMatchObject({ coverage: 'all', handover: 'trade', approval: 'lead' })
      await expectApiError(json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(schedule.id), { handover: 'both' }), 400, 'invalid_schedule_settings')
      // Copying from a schedule carries its settings over.
      const target = await createSchedule(op.id)
      const copied = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.copyFrom(target.id), { scheduleId: schedule.id, offsetDays: 0 }))
      expect(copied.schedule).toMatchObject({ coverage: 'all', handover: 'trade', approval: 'lead' })
    })

    for (const approval of ['peer', 'lead'] as const) {
      it(`coverage "all" + trade (${approval}): trades keep both counts, nothing lowers one`, async () => {
        const s = await tradeSetup({ coverage: 'all', handover: 'trade', approval }, approval === 'lead')
        const [annBefore, boBefore] = [await countOf(s.ann), await countOf(s.bo)]
        // Opening a release is refused; opening without a kind is a trade.
        await expectApiError(open(s.ann, s.annShift.assignment.id, { kind: 'release' }), 409, 'handover_not_allowed')
        const swap = await ok(await open(s.ann, s.annShift.assignment.id))
        expect(swap).toMatchObject({ kind: 'trade', settings: { coverage: 'all', handover: 'trade', approval } })
        const detail = await ok(await json(s.ann.cookie, 'GET', shiftsApi.me.shift(s.annShift.assignment.id)))
        expect(detail.settings).toMatchObject({ coverage: 'all' })
        // An offer without a shift in return is refused.
        await expectApiError(offerOn(s.bo, swap.id), 409, 'handover_not_allowed')
        const offer = await ok(await offerOn(s.bo, swap.id, s.boShift.assignment.id))
        const accepted = await ok(await json(s.ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))
        if (approval === 'lead') {
          expect(accepted.status).toBe('pending_approval')
          const pending = (await getEmailsTo(s.boss.email)).find(email => email.template?.name === 'shifts-swap-pending')!
          expect(pending.text).toMatch(/want to trade shifts/)
          expect((await ok(await json(s.boss.cookie, 'POST', shiftsApi.approveSwap(swap.id)))).status).toBe('completed')
        }
        else {
          expect(accepted.status).toBe('completed')
        }
        expect(await assignmentOf(s.ann, s.later.id)).toBeDefined()
        expect(await assignmentOf(s.bo, s.shifts[0]!.id)).toBeDefined()
        expect([await countOf(s.ann), await countOf(s.bo)]).toEqual([annBefore, boBefore])
        expect((await getHooks()).filter(hook => hook.swapId === swap.id).every(hook => hook.kind === 'trade')).toBe(true)
        const completed = (await getEmailsTo(s.bo.email)).find(email => email.template?.name === 'shifts-swap-completed')!
        expect(completed.template!.props).toMatchObject({ trade: true })
      })
    }

    it('coverage "all" + trade: refuses accepting a release opened before the schedule changed, and the marketplace hides it', async () => {
      const s = await tradeSetup({})
      const cy = await user('Tcy')
      await addMember(s.team.id, cy)
      const swap = await ok(await open(s.ann, s.annShift.assignment.id, { kind: 'release' }))
      const offer = await ok(await offerOn(cy, swap.id))
      await ok(await json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(s.schedule.id), { coverage: 'all', handover: 'trade' }))
      await expectApiError(json(s.ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)), 409, 'handover_not_allowed')
      expect((await ok(await json(cy.cookie, 'GET', shiftsApi.swaps)) as unknown as Json[]).find(item => item.id === swap.id)).toBeUndefined()
      // A new offer on it is refused too, and Ann keeps her shift.
      const dee = await user('Tdee')
      await addMember(s.team.id, dee)
      await expectApiError(offerOn(dee, swap.id), 409, 'handover_not_allowed')
      expect(await countOf(s.ann)).toBe(1)
    })

    it('approving re-checks the settings: a release waiting for a lead is refused once coverage is "all"', async () => {
      const s = await tradeSetup({ approval: 'lead' }, true)
      const cy = await user('Tcy')
      await addMember(s.team.id, cy)
      const swap = await ok(await open(s.ann, s.annShift.assignment.id, { kind: 'release' }))
      const offer = await ok(await offerOn(cy, swap.id))
      expect((await ok(await json(s.ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))).status).toBe('pending_approval')
      await ok(await json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(s.schedule.id), { coverage: 'all', handover: 'trade' }))
      await expectApiError(json(s.boss.cookie, 'POST', shiftsApi.approveSwap(swap.id)), 409, 'handover_not_allowed')
      expect(await assignmentOf(s.ann, s.shifts[0]!.id)).toBeDefined()
    })

    it('flexible + trade allows trades only; flexible + release gives away only; flexible + both lets the owner choose', async () => {
      const trade = await tradeSetup({ handover: 'trade' })
      await expectApiError(open(trade.ann, trade.annShift.assignment.id, { kind: 'release' }), 409, 'handover_not_allowed')
      expect(await ok(await open(trade.ann, trade.annShift.assignment.id))).toMatchObject({ kind: 'trade' })

      const release = await tradeSetup({ handover: 'release' })
      const cy = await user('Rcy')
      await addMember(release.team.id, cy)
      await expectApiError(open(release.ann, release.annShift.assignment.id, { kind: 'trade' }), 409, 'handover_not_allowed')
      const given = await ok(await open(release.ann, release.annShift.assignment.id))
      expect(given).toMatchObject({ kind: 'release' })
      await expectApiError(offerOn(release.bo, given.id, release.boShift.assignment.id), 400)
      const taken = await ok(await offerOn(cy, given.id))
      expect((await ok(await json(release.ann.cookie, 'POST', shiftsApi.acceptOffer(given.id, taken.id)))).status).toBe('completed')
      expect([await countOf(release.ann), await countOf(cy)]).toEqual([0, 1])
      expect((await getHooks()).filter(hook => hook.swapId === given.id).every(hook => hook.kind === 'release')).toBe(true)

      const both = await tradeSetup({ handover: 'both' })
      expect(await ok(await open(both.ann, both.annShift.assignment.id, { kind: 'trade' }))).toMatchObject({ kind: 'trade' })
      expect(await ok(await open(both.bo, both.boShift.assignment.id, { kind: 'release' }))).toMatchObject({ kind: 'release' })
    })

    it('aims a trade at one shift: only its holder sees it and offers that shift, and gets a proposal', async () => {
      const s = await tradeSetup({ coverage: 'all', handover: 'trade' })
      const cy = await user('Acy')
      await addMember(s.team.id, cy)
      const [cyDay] = await bulk(s.schedule.id, { teamId: s.team.id, days: ['2027-07-03'], slots: [{ start: '10:00', end: '14:00' }] })
      const cyShift = await assigned(cyDay!.id, cy)
      await expectApiError(open(s.ann, s.annShift.assignment.id, { kind: 'release', wantedAssignmentId: s.boShift.assignment.id }), 409, 'handover_not_allowed')
      await expectApiError(open(s.ann, s.annShift.assignment.id, { wantedAssignmentId: s.annShift.assignment.id }), 400)
      const swap = await ok(await open(s.ann, s.annShift.assignment.id, { wantedAssignmentId: s.boShift.assignment.id }))
      expect(swap).toMatchObject({ kind: 'trade', wantedAssignmentId: s.boShift.assignment.id, wantedShift: { id: s.later.id } })
      expect((await getEmailsTo(s.bo.email)).find(email => email.template?.name === 'shifts-swap-proposed')).toBeDefined()
      expect((await ok(await json(cy.cookie, 'GET', shiftsApi.swaps)) as unknown as Json[]).find(item => item.id === swap.id)).toBeUndefined()
      expect((await ok(await json(s.bo.cookie, 'GET', shiftsApi.swaps)) as unknown as Json[]).find(item => item.id === swap.id)).toBeDefined()
      await expectApiError(offerOn(cy, swap.id, cyShift.assignment.id), 409, 'not_wanted')
      const offer = await ok(await offerOn(s.bo, swap.id, s.boShift.assignment.id))
      expect((await ok(await json(s.ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))).status).toBe('completed')
    })

    /** A second published schedule in the same operation, with one shift for the team on another day. */
    async function otherSchedule(setup: { op: Json, team: Json }, body: Json, day = '2027-07-04') {
      const schedule = await createSchedule(setup.op.id, body)
      const [shift] = await bulk(schedule.id, { teamId: setup.team.id, days: [day], slots: [{ start: '10:00', end: '14:00' }] })
      await publish(schedule.id)
      return { schedule, shift: shift! }
    }

    it('keeps a shift that must be worked inside its schedule: no trade into or out of another schedule', async () => {
      // Roskilde: every shift must be worked, trades only. Another schedule of the same operation is flexible.
      const s = await tradeSetup({ coverage: 'all', handover: 'trade' })
      const flexible = await otherSchedule(s, { coverage: 'flexible', handover: 'both' })
      const dee = await user('Xdee')
      await addMember(s.team.id, dee)
      const deeShift = await assigned(flexible.shift.id, dee)
      // Ann offers her Roskilde shift for Dee's flexible one: refused from either side, and when aimed at it.
      const annSwap = await ok(await open(s.ann, s.annShift.assignment.id))
      await expectApiError(offerOn(dee, annSwap.id, deeShift.assignment.id), 409, 'handover_cross_schedule')
      const deeSwap = await ok(await open(dee, deeShift.assignment.id, { kind: 'trade' }))
      await expectApiError(offerOn(s.ann, deeSwap.id, s.annShift.assignment.id), 409, 'handover_cross_schedule')
      await ok(await json(s.bo.cookie, 'POST', shiftsApi.offers(annSwap.id), { assignmentId: s.boShift.assignment.id }))
      const [ann2] = await bulk(s.schedule.id, { teamId: s.team.id, days: ['2027-07-05'], slots: [{ start: '10:00', end: '14:00' }] })
      const annSecond = await assigned(ann2!.id, s.ann)
      await expectApiError(open(s.ann, annSecond.assignment.id, { wantedAssignmentId: deeShift.assignment.id }), 409, 'handover_cross_schedule')

      // Two flexible schedules trade freely, unless one of them allows no trades.
      const a = await tradeSetup({})
      const b = await otherSchedule(a, { handover: 'both' })
      const releaseOnly = await otherSchedule(a, { handover: 'release' }, '2027-07-06')
      const [eve, fay] = await Promise.all([user('Xeve'), user('Xfay')])
      for (const who of [eve, fay]) await addMember(a.team.id, who)
      const eveShift = await assigned(b.shift.id, eve)
      const fayShift = await assigned(releaseOnly.shift.id, fay)
      const trade = await ok(await open(a.ann, a.annShift.assignment.id, { kind: 'trade' }))
      await expectApiError(offerOn(fay, trade.id, fayShift.assignment.id), 409, 'handover_not_allowed')
      const offer = await ok(await offerOn(eve, trade.id, eveShift.assignment.id))
      // The other schedule switches to "every shift" before the owner accepts: refused at accept time.
      await ok(await json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(b.schedule.id), { coverage: 'all', handover: 'trade' }))
      await expectApiError(json(a.ann.cookie, 'POST', shiftsApi.acceptOffer(trade.id, offer.id)), 409, 'handover_cross_schedule')
      expect(await countOf(a.ann)).toBe(1)
    })

    it('needs a lead when the schedule of the shift given back asks for one', async () => {
      const s = await tradeSetup({ approval: 'peer' }, true)
      const leadSchedule = await otherSchedule(s, { handover: 'trade', approval: 'lead' })
      const dee = await user('Ldee')
      await addMember(s.team.id, dee)
      const deeShift = await assigned(leadSchedule.shift.id, dee)
      const swap = await ok(await open(s.ann, s.annShift.assignment.id, { kind: 'trade' }))
      const offer = await ok(await offerOn(dee, swap.id, deeShift.assignment.id))
      expect((await ok(await json(s.ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))).status).toBe('pending_approval')
      expect(await assignmentOf(s.ann, s.shifts[0]!.id)).toBeDefined()
      expect((await json(dee.cookie, 'POST', shiftsApi.approveSwap(swap.id))).status).toBe(403)
      expect((await ok(await json(s.boss.cookie, 'POST', shiftsApi.approveSwap(swap.id)))).status).toBe('completed')
      expect(await assignmentOf(s.ann, leadSchedule.shift.id)).toBeDefined()
    })

    it('replaces a stale open swap on reopening, and refuses while offers wait on it', async () => {
      const s = await tradeSetup({})
      const swapStatus = async (id: string) => (await ok(await json(staff.cookie, 'GET', `${shiftsApi.admin.swaps}?operationId=${s.op.id}`)) as unknown as Json[]).find(item => item.id === id)!.status
      // Another kind asked for: the open swap is cancelled and a new one opened.
      const trade = await ok(await open(s.ann, s.annShift.assignment.id, { kind: 'trade' }))
      const release = await ok(await open(s.ann, s.annShift.assignment.id, { kind: 'release' }))
      expect(release.id).not.toBe(trade.id)
      expect(release.kind).toBe('release')
      expect(await swapStatus(trade.id)).toBe('cancelled')
      // The schedule no longer allows it: reopening without a kind replaces it with a trade.
      await ok(await json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(s.schedule.id), { coverage: 'all', handover: 'trade' }))
      const detail = await ok(await json(s.ann.cookie, 'GET', shiftsApi.me.shift(s.annShift.assignment.id)))
      expect(detail.swapDetail).toMatchObject({ id: release.id, kind: 'release' })
      const replaced = await ok(await open(s.ann, s.annShift.assignment.id))
      expect(replaced).toMatchObject({ kind: 'trade' })
      expect(await swapStatus(release.id)).toBe('cancelled')
      // With an offer waiting, a stale swap is not replaced.
      await ok(await json(staff.cookie, 'PATCH', shiftsApi.admin.schedule(s.schedule.id), { coverage: 'flexible', handover: 'both' }))
      const cy = await user('Scy')
      await addMember(s.team.id, cy)
      await ok(await open(s.bo, s.boShift.assignment.id, { kind: 'release' }))
      const boSwap = (await assignmentOf(s.bo, s.later.id))!.swap
      await ok(await offerOn(cy, boSwap.id))
      await expectApiError(open(s.bo, s.boShift.assignment.id, { kind: 'trade' }), 409, 'swap_changed')
      expect(await swapStatus(boSwap.id)).toBe('offered')
    })

    it('runs the guards for both people at offer and accept time, each answering a code naming the guard', async () => {
      // Overlap: Bo works 12:00–15:00, so taking Ann's 10:00–14:00 overlaps.
      const overlap = await tradeSetup({ coverage: 'all', handover: 'trade' })
      const [busy] = await bulk(overlap.schedule.id, { teamId: overlap.team.id, days: ['2027-06-28'], slots: [{ start: '12:00', end: '15:00' }] })
      await assigned(busy!.id, overlap.bo)
      const swap1 = await ok(await open(overlap.ann, overlap.annShift.assignment.id))
      await expectApiError(offerOn(overlap.bo, swap1.id, overlap.boShift.assignment.id), 409, 'guard_overlap')

      // Rest: Bo works the evening of the same day, 4 hours after Ann's shift ends; 6 are required.
      const rest = await tradeSetup({ coverage: 'all', handover: 'trade', guards: { minRestHours: 6 } })
      await assigned(rest.shifts[1]!.id, rest.bo)
      const swap2 = await ok(await open(rest.ann, rest.annShift.assignment.id))
      await expectApiError(offerOn(rest.bo, swap2.id, rest.boShift.assignment.id), 409, 'guard_rest')

      // Max per day: one shift a day, and Bo works that evening.
      const perDay = await tradeSetup({ coverage: 'all', handover: 'trade', guards: { maxShiftsPerDay: 1 } })
      await assigned(perDay.shifts[1]!.id, perDay.bo)
      const swap3 = await ok(await open(perDay.ann, perDay.annShift.assignment.id))
      await expectApiError(offerOn(perDay.bo, swap3.id, perDay.boShift.assignment.id), 409, 'guard_max_per_day')

      // Ineligible: the shift needs a BA, and Bo is a volunteer.
      const role = await tradeSetup({ coverage: 'all', handover: 'trade' })
      const ba = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.roles(role.schedule.id), { teamId: role.team.id, teamRole: 'ba', name: 'BA' }))
      const lead = await user('Gba')
      await addMember(role.team.id, lead, 'ba')
      const leadShift = await assigned(role.shifts[1]!.id, lead, { shiftRoleId: ba.id })
      const swap4 = await ok(await open(lead, leadShift.assignment.id))
      await expectApiError(offerOn(role.bo, swap4.id, role.boShift.assignment.id), 409, 'guard_ineligible')

      // Capacity: one person per shift, and staff forced a second onto Ann's.
      const full = await tradeSetup({ coverage: 'all', handover: 'trade', maxPerShift: 1 })
      const extra = await user('Gextra')
      await addMember(full.team.id, extra)
      await assigned(full.shifts[0]!.id, extra, { force: true })
      const swap5 = await ok(await open(full.ann, full.annShift.assignment.id))
      await expectApiError(offerOn(full.bo, swap5.id, full.boShift.assignment.id), 409, 'guard_capacity')

      // The owner's side: Ann works at the time of Bo's shift too, so taking it overlaps (her userId in the answer).
      const owner = await tradeSetup({ coverage: 'all', handover: 'trade' })
      const [clash] = await bulk(owner.schedule.id, { teamId: owner.team.id, days: ['2027-06-30'], slots: [{ start: '11:00', end: '13:00' }] })
      await assigned(clash!.id, owner.ann)
      const swap6 = await ok(await open(owner.ann, owner.annShift.assignment.id))
      const refused = await json(owner.bo.cookie, 'POST', shiftsApi.offers(swap6.id), { assignmentId: owner.boShift.assignment.id })
      expect(refused.status).toBe(409)
      expect(await refused.json()).toMatchObject({ data: { code: 'guard_overlap', userId: owner.ann.id } })

      // At accept time: Bo took on a clashing shift after offering.
      const late = await tradeSetup({ coverage: 'all', handover: 'trade' })
      const swap7 = await ok(await open(late.ann, late.annShift.assignment.id))
      const offer = await ok(await offerOn(late.bo, swap7.id, late.boShift.assignment.id))
      const [later] = await bulk(late.schedule.id, { teamId: late.team.id, days: ['2027-06-28'], slots: [{ start: '09:00', end: '11:00' }] })
      await assigned(later!.id, late.bo)
      await expectApiError(json(late.ann.cookie, 'POST', shiftsApi.acceptOffer(swap7.id, offer.id)), 409, 'guard_overlap')
    })
  })

  describe('attendance', () => {
    it('shows the pass and checks in only inside the window, once', async () => {
      const setup = await newSetup()
      const other = await createTeam(setup.op.id)
      const [ann, lead, otherLead] = await Promise.all([user('Pann'), user('Plead'), user('Pother')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, lead, 'ba')
      await addMember(other.id, otherLead, 'ba')
      const shiftId = setup.shifts[0]!.id
      const { assignment } = await assigned(shiftId, ann)

      // Three hours ahead: no pass, no check-in yet.
      await patchShift(shiftId, { startsAt: iso(3 * HOUR), endsAt: iso(6 * HOUR) })
      const early = await ok(await json(ann.cookie, 'GET', shiftsApi.me.pass(assignment.id)))
      expect(early).toMatchObject({ available: false, code: null, svg: null })
      // Only the person sees their pass.
      expect((await json(lead.cookie, 'GET', shiftsApi.me.pass(assignment.id))).status).toBe(404)

      // Half an hour ahead: the pass shows.
      await patchShift(shiftId, { startsAt: iso(HOUR / 2), endsAt: iso(4 * HOUR) })
      const pass = await ok(await json(ann.cookie, 'GET', shiftsApi.me.pass(assignment.id)))
      expect(pass.available).toBe(true)
      expect(pass.code).toMatch(/^[0-9a-f]{64}$/)
      expect(pass.svg).toContain('<svg')

      // A lead of another team: 403 on this team's scanner, 404 for this code on their own.
      expect((await json(otherLead.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code: pass.code })).status).toBe(403)
      await expectApiError(json(otherLead.cookie, 'POST', shiftsApi.teams.checkIn(other.id), { code: pass.code }), 404)
      await expectApiError(json(lead.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code: 'f'.repeat(64) }), 404)
      // A volunteer cannot check in.
      expect((await json(ann.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code: pass.code })).status).toBe(403)

      const first = await ok(await json(lead.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code: pass.code }))
      expect(first).toMatchObject({ ok: true, alreadyCheckedIn: false, assignment: { id: assignment.id, status: 'attended', checkedInBy: lead.id } })
      const second = await ok(await json(lead.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code: pass.code }))
      expect(second).toMatchObject({ alreadyCheckedIn: true, checkedInAt: first.checkedInAt })
      expect((await getHooks()).filter(hook => hook.name === 'attendance:marked' && hook.assignmentId === assignment.id)).toHaveLength(1)

      // After the shift: closed.
      const late = await assigned(setup.shifts[1]!.id, ann)
      await patchShift(setup.shifts[1]!.id, { startsAt: iso(-4 * HOUR), endsAt: iso(-2 * HOUR) })
      const latePass = await ok(await json(ann.cookie, 'GET', shiftsApi.me.pass(late.assignment.id)))
      expect(latePass.available).toBe(false)
      // The code is never shown outside the window, so staff read it from nowhere: a lead marks the no-show instead.
      const marked = await ok(await json(lead.cookie, 'POST', shiftsApi.noShow(late.assignment.id)))
      expect(marked).toMatchObject({ status: 'no_show' })
      expect((await ok(await json(lead.cookie, 'POST', shiftsApi.attended(late.assignment.id))))).toMatchObject({ status: 'attended' })
      expect((await json(ann.cookie, 'POST', shiftsApi.noShow(late.assignment.id))).status).toBe(403)
    })

    it('refuses a check-in outside the window', async () => {
      const setup = await newSetup()
      const [ann, lead] = await Promise.all([user('Wann'), user('Wlead')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, lead, 'ba')
      const { assignment } = await assigned(setup.shifts[0]!.id, ann)
      await patchShift(setup.shifts[0]!.id, { startsAt: iso(HOUR / 2), endsAt: iso(HOUR) })
      const { code } = await ok(await json(ann.cookie, 'GET', shiftsApi.me.pass(assignment.id)))
      await patchShift(setup.shifts[0]!.id, { startsAt: iso(3 * HOUR), endsAt: iso(4 * HOUR) })
      await expectApiError(json(lead.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code }), 409, 'outside_window')
      await patchShift(setup.shifts[0]!.id, { startsAt: iso(-3 * HOUR), endsAt: iso(-HOUR) })
      await expectApiError(json(lead.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code }), 409, 'outside_window')
    })
  })

  describe('who is on shift now, and contact details', () => {
    it('shows the people on shift and the lead on duty; contact details only with shifts:pii', async () => {
      const setup = await newSetup()
      const [ann, lead, outsider] = await Promise.all([user('Nann'), user('Nlead'), user('Nout')])
      const manager = await user('Nmgr', 'mgr.test')
      const wild = await user('Nwild', 'wild.test')
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, lead, 'ba')
      await patchShift(setup.shifts[0]!.id, { startsAt: iso(-HOUR), endsAt: iso(HOUR) })
      await assigned(setup.shifts[0]!.id, ann)
      await assigned(setup.shifts[0]!.id, lead)

      const forStaff = await ok(await json(staff.cookie, 'GET', shiftsApi.now(setup.op.id)))
      expect(forStaff.teams).toHaveLength(1)
      expect(forStaff.teams[0].leads.map((person: Json) => person.userId)).toEqual([lead.id])
      expect(forStaff.teams[0].shifts[0].assignees.find((item: Json) => item.userId === ann.id).person).toMatchObject({ name: ann.name, email: ann.email })

      // Ann takes part (an explicit team role): names, no contact details.
      const forAnn = await ok(await json(ann.cookie, 'GET', shiftsApi.now(setup.op.id)))
      const annPerson = forAnn.teams[0].shifts[0].assignees.find((item: Json) => item.userId === ann.id).person
      expect(annPerson.name).toBe(ann.name)
      expect(annPerson.email).toBeUndefined()
      expect(forAnn.teams[0].leads[0].email).toBeUndefined()
      // Somebody outside the operation does not see it.
      expect((await json(outsider.cookie, 'GET', shiftsApi.now(setup.op.id))).status).toBe(403)
      // `shifts:manage` without `shifts:pii`, and `shifts:*`: no contact details.
      for (const who of [manager, wild]) {
        const view = await ok(await json(who.cookie, 'GET', shiftsApi.now(setup.op.id)))
        expect(view.teams[0].shifts[0].assignees[0].person.email).toBeUndefined()
      }

      // The team view: the lead reads names; staff with pii the contact details; a volunteer nothing.
      const leadView = await ok(await json(lead.cookie, 'GET', shiftsApi.teams.shifts(setup.team.id))) as unknown as Json[]
      expect(leadView.find(shift => shift.id === setup.shifts[0]!.id)!.assignees.map((item: Json) => item.person.email)).toEqual([undefined, undefined])
      const staffView = await ok(await json(staff.cookie, 'GET', shiftsApi.teams.shifts(setup.team.id))) as unknown as Json[]
      expect(staffView.find(shift => shift.id === setup.shifts[0]!.id)!.assignees.map((item: Json) => item.person.email).sort()).toEqual([ann.email, lead.email].sort())
      expect((await json(ann.cookie, 'GET', shiftsApi.teams.shifts(setup.team.id))).status).toBe(403)

      // The detail page names the lead on duty.
      const mine = (await assignmentOf(ann, setup.shifts[0]!.id))!
      const detail = await ok(await json(ann.cookie, 'GET', shiftsApi.me.shift(mine.assignment.id)))
      expect(detail.leadsOnDuty.map((person: Json) => person.userId)).toEqual([lead.id])
    })

    it('reads my shifts with a token holding the shifts scope, and nothing staff-only', async () => {
      const setup = await newSetup()
      const ann = await user('Tann')
      await addMember(setup.team.id, ann)
      await assigned(setup.shifts[0]!.id, ann)
      const token = await createToken(ann.cookie, ['shifts'])
      const bearer = apiClient({ bearer: token })
      expect(await (await bearer.fetch('GET', shiftsApi.me.shifts)).json()).toHaveLength(1)
      await expectApiError(bearer.fetch('GET', shiftsApi.admin.schedules), 403)
      // `shifts:swap` is not in the scope.
      const mine = (await assignmentOf(ann, setup.shifts[0]!.id))!
      await expectApiError(bearer.fetch('POST', shiftsApi.me.swap(mine.assignment.id)), 403, 'insufficient_scope')
    })
  })

  describe('people leaving a team', () => {
    it('cancels their future shifts on the team, and the ones a lower role no longer meets', async () => {
      const setup = await newSetup()
      const role = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.roles(setup.schedule.id), { teamId: setup.team.id, teamRole: 'ba', name: 'BA' }))
      const [ann, bo] = await Promise.all([user('Lann'), user('Lbo')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, bo, 'ba')
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
      const boPlain = await assigned(setup.shifts[0]!.id, bo)
      const boLead = await assigned(setup.shifts[1]!.id, bo, { shiftRoleId: role.id })

      await ok(await json(staff.cookie, 'DELETE', teamsApi.admin.member(setup.team.id, ann.id)))
      expect(await myShifts(ann)).toEqual([])
      expect((await getHooks()).find(hook => hook.name === 'assignment:changed' && hook.assignmentId === annShift.assignment.id && hook.status === 'cancelled')).toMatchObject({ previousStatus: 'assigned' })
      // The swap of the cancelled assignment is gone from the marketplace.
      expect((await ok(await json(bo.cookie, 'GET', shiftsApi.swaps)) as unknown as Json[]).find(item => item.id === swap.id)).toBeUndefined()

      // Bo goes from BA to volunteer: the BA shift is cancelled, the plain one kept.
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(setup.team.id, bo.id), { role: 'volunteer' }))
      const left = await myShifts(bo)
      expect(left.map(item => item.assignment.id)).toEqual([boPlain.assignment.id])
      expect((await getHooks()).find(hook => hook.assignmentId === boLead.assignment.id && hook.status === 'cancelled')).toBeDefined()
    })

    it('cancels an assignment for staff, never an attended one', async () => {
      const setup = await newSetup()
      const ann = await user('Kann')
      await addMember(setup.team.id, ann)
      const { assignment } = await assigned(setup.shifts[0]!.id, ann)
      await ok(await json(staff.cookie, 'DELETE', shiftsApi.admin.assignment(assignment.id)))
      expect(await myShifts(ann)).toEqual([])
      const again = await assigned(setup.shifts[0]!.id, ann)
      // Attendance is marked once check-in opens.
      await expectApiError(json(staff.cookie, 'POST', shiftsApi.attended(again.assignment.id)), 409, 'outside_window')
      await patchShift(setup.shifts[0]!.id, { startsAt: iso(HOUR / 2), endsAt: iso(3 * HOUR) })
      await ok(await json(staff.cookie, 'POST', shiftsApi.attended(again.assignment.id)))
      await expectApiError(json(staff.cookie, 'DELETE', shiftsApi.admin.assignment(again.assignment.id)), 409, 'invalid_transition')
      // A schedule with people on it cannot be deleted; a shift neither.
      await expectApiError(json(staff.cookie, 'DELETE', shiftsApi.admin.schedule(setup.schedule.id)), 409, 'schedule_in_use')
      await expectApiError(json(staff.cookie, 'DELETE', shiftsApi.admin.shift(setup.shifts[0]!.id)), 409, 'shift_in_use')
      await ok(await json(staff.cookie, 'DELETE', shiftsApi.admin.shift(setup.shifts[1]!.id)))
    })
  })

  describe('races and recovery', () => {
    const swapOf = async (operationId: string, swapId: string): Promise<Json> =>
      (await ok(await json(staff.cookie, 'GET', `${shiftsApi.admin.swaps}?operationId=${operationId}`)) as unknown as Json[]).find(item => item.id === swapId)!

    it('settles a withdraw and an approval at once one way, never half', async () => {
      for (let round = 0; round < 3; round++) {
        const setup = await newSetup({ approval: 'lead' })
        const [ann, bo, lead] = await Promise.all([user('Qann'), user('Qbo'), user('Qlead')])
        await addMember(setup.team.id, ann)
        await addMember(setup.team.id, bo)
        await addMember(setup.team.id, lead, 'ba')
        const annShift = await assigned(setup.shifts[0]!.id, ann)
        const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
        const offer = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {}))
        await ok(await json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))
        const answers = await Promise.all([
          json(bo.cookie, 'DELETE', shiftsApi.offer(swap.id, offer.id)),
          json(lead.cookie, 'POST', shiftsApi.approveSwap(swap.id)),
        ])
        expect(answers.filter(response => response.status < 300)).toHaveLength(1)
        const after = await swapOf(setup.op.id, swap.id)
        const finalOffer = after.offers.find((item: Json) => item.id === offer.id)
        if (after.status === 'completed') {
          expect(finalOffer.status).toBe('accepted')
          expect(await assignmentOf(bo, setup.shifts[0]!.id)).toBeDefined()
        }
        else {
          expect(after.status).toBe('open')
          expect(['withdrawn', 'rejected']).toContain(finalOffer.status)
          expect(await assignmentOf(ann, setup.shifts[0]!.id)).toBeDefined()
        }
      }
    })

    it('keeps the earliest of two offers of one person', async () => {
      const setup = await newSetup()
      const [ann, bo] = await Promise.all([user('Dann'), user('Dbo')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, bo)
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
      const answers = await Promise.all([json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {}), json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {})])
      expect(answers.map(response => response.status).sort()).toEqual([201, 409])
      expect((await swapOf(setup.op.id, swap.id)).offers.filter((item: Json) => item.status === 'offered')).toHaveLength(1)
    })

    it('refuses to give back a shift whose own swap waits for approval', async () => {
      const setup = await newSetup({ approval: 'lead' })
      const [ann, bo, cy] = await Promise.all([user('Gann'), user('Gbo'), user('Gcy')])
      for (const who of [ann, bo, cy]) await addMember(setup.team.id, who)
      const [extra] = await bulk(setup.schedule.id, { teamId: setup.team.id, days: ['2027-07-02'], slots: [{ start: '10:00', end: '14:00' }] })
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const boShift = await assigned(extra!.id, bo)
      // Bo's own shift is accepted in a swap with Cy, waiting for approval.
      const boSwap = await ok(await json(bo.cookie, 'POST', shiftsApi.me.swap(boShift.assignment.id)))
      const cyOffer = await ok(await json(cy.cookie, 'POST', shiftsApi.offers(boSwap.id), {}))
      await ok(await json(bo.cookie, 'POST', shiftsApi.acceptOffer(boSwap.id, cyOffer.id)))
      const annSwap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id), { kind: 'trade' }))
      await expectApiError(json(bo.cookie, 'POST', shiftsApi.offers(annSwap.id), { assignmentId: boShift.assignment.id }), 409, 'not_swappable')
    })

    it('recovers a swap stuck halfway: staff cancel puts the shift back, the owner may withdraw a stale one', async () => {
      const setup = await newSetup()
      const [ann, bo] = await Promise.all([user('Sann'), user('Sbo')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, bo)
      const [extra] = await bulk(setup.schedule.id, { teamId: setup.team.id, days: ['2027-07-02'], slots: [{ start: '10:00', end: '14:00' }] })
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const boShift = await assigned(extra!.id, bo)
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id), { kind: 'trade' }))
      const offer = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(swap.id), { assignmentId: boShift.assignment.id }))
      // Ann's shift went to Bo, Bo's never came back: half an exchange.
      await ok(await json(undefined, 'POST', '/api/test/stuck-swap', { swapId: swap.id, offerId: offer.id }))
      expect(await assignmentOf(bo, setup.shifts[0]!.id)).toBeDefined()
      expect((await json(ann.cookie, 'POST', shiftsApi.admin.cancelSwap(swap.id))).status).toBe(403)
      const cancelled = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.cancelSwap(swap.id)))
      expect(cancelled.status).toBe('cancelled')
      expect(await assignmentOf(ann, setup.shifts[0]!.id)).toBeDefined()
      expect(await assignmentOf(bo, extra!.id)).toBeDefined()
      expect(await assignmentOf(bo, setup.shifts[0]!.id)).toBeUndefined()

      // A second swap stuck before anything moved: the owner withdraws it once it is stale.
      const again = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
      const second = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(again.id), {}))
      await ok(await json(undefined, 'POST', '/api/test/stuck-swap', { swapId: again.id, offerId: second.id, moved: false }))
      await ok(await json(ann.cookie, 'DELETE', shiftsApi.me.swap(annShift.assignment.id)))
      expect((await swapOf(setup.op.id, again.id)).status).toBe('cancelled')
      expect(await assignmentOf(ann, setup.shifts[0]!.id)).toBeDefined()
    })
  })

  describe('leads and eligibility', () => {
    it('gives leads their teams, the swaps waiting for them and the team view; others nothing', async () => {
      const setup = await newSetup({ approval: 'lead' })
      const [ann, bo, lead] = await Promise.all([user('Lann2'), user('Lbo2'), user('Llead2')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, bo)
      await addMember(setup.team.id, lead, 'ba')
      expect((await ok(await json(lead.cookie, 'GET', shiftsApi.me.leads)) as unknown as Json[]).map(item => item.teamId)).toEqual([setup.team.id])
      expect(await ok(await json(ann.cookie, 'GET', shiftsApi.me.leads))).toEqual([])
      const annShift = await assigned(setup.shifts[0]!.id, ann)
      const swap = await ok(await json(ann.cookie, 'POST', shiftsApi.me.swap(annShift.assignment.id)))
      const offer = await ok(await json(bo.cookie, 'POST', shiftsApi.offers(swap.id), {}))
      await ok(await json(ann.cookie, 'POST', shiftsApi.acceptOffer(swap.id, offer.id)))
      const pending = await ok(await json(lead.cookie, 'GET', `${shiftsApi.teams.swaps(setup.team.id)}?status=pending_approval`)) as unknown as Json[]
      expect(pending.map(item => item.id)).toEqual([swap.id])
      expect((await json(ann.cookie, 'GET', shiftsApi.teams.swaps(setup.team.id))).status).toBe(403)
      // The pending email points at the lead page (no site origin here: no link, but the template is the pending one).
      expect((await getEmailsTo(lead.email)).map(email => email.template?.name)).toContain('shifts-swap-pending')
      // The schedule forms read the teams through shifts: `shifts:manage` is enough.
      const manager = await user('Lmgr', 'mgr.test')
      const teams = await ok(await json(manager.cookie, 'GET', shiftsApi.admin.teams(setup.op.id))) as unknown as Json[]
      expect(teams[0]).toMatchObject({ id: setup.team.id, kind: 'bar', ladder: { leadFrom: 'ba' } })
    })

    it('checks eligibility for the role picked, and copies roles only onto a ladder that has them', async () => {
      const setup = await newSetup()
      const role = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.roles(setup.schedule.id), { teamId: setup.team.id, teamRole: 'ba', name: 'BA' }))
      const vol = await user('Evol')
      await addMember(setup.team.id, vol)
      const plain = await ok(await json(staff.cookie, 'GET', shiftsApi.admin.candidates(setup.shifts[0]!.id))) as unknown as Json[]
      expect(plain.find(item => item.userId === vol.id)).toMatchObject({ eligible: true })
      const asBa = await ok(await json(staff.cookie, 'GET', `${shiftsApi.admin.candidates(setup.shifts[0]!.id)}?shiftRoleId=${role.id}`)) as unknown as Json[]
      expect(asBa.find(item => item.userId === vol.id)).toMatchObject({ eligible: false, reason: 'role' })

      // A team of the same name but another kind, whose ladder has no `ba`: the role comes over without its minimum.
      await ok(await json(staff.cookie, 'PUT', teamsApi.admin.ladder('firstaid'), { roles: [{ key: 'helper', label: 'Helper' }], leadFrom: null }))
      const next = await createOperation()
      await ok(await json(staff.cookie, 'POST', teamsApi.admin.teams, { ownerType: 'operation', ownerId: next.id, kind: 'firstaid', name: setup.team.name }))
      const target = await createSchedule(next.id)
      const copied = await ok(await json(staff.cookie, 'POST', shiftsApi.admin.copyFrom(target.id), { scheduleId: setup.schedule.id, offsetDays: 0 }))
      expect(copied).toMatchObject({ roles: 1, changedRoleIds: [role.id] })
      const roles = await ok(await json(staff.cookie, 'GET', shiftsApi.admin.roles(target.id))) as unknown as Json[]
      expect(roles[0]).toMatchObject({ teamRole: null })
    })

    it('gives no pass and no check-in to somebody whose membership stopped granting, and cancels their future shifts', async () => {
      const setup = await newSetup()
      const [ann, lead] = await Promise.all([user('Iann'), user('Ilead')])
      await addMember(setup.team.id, ann)
      await addMember(setup.team.id, lead, 'ba')
      const now = await assigned(setup.shifts[0]!.id, ann)
      const later = await assigned(setup.shifts[1]!.id, ann)
      await patchShift(setup.shifts[0]!.id, { startsAt: iso(-HOUR / 6), endsAt: iso(3 * HOUR) })
      const { code } = await ok(await json(ann.cookie, 'GET', shiftsApi.me.pass(now.assignment.id)))
      expect(code).toBeTruthy()
      // The membership stops granting (a status, not a removal): teams fires no hook for it.
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(setup.team.id, ann.id), { status: 'inactive' }))
      await expectApiError(json(lead.cookie, 'POST', shiftsApi.teams.checkIn(setup.team.id), { code }), 409, 'not_eligible')
      expect(await ok(await json(ann.cookie, 'GET', shiftsApi.me.pass(now.assignment.id)))).toMatchObject({ available: false, code: null })
      expect((await myShifts(ann)).map(item => item.assignment.id)).toEqual([now.assignment.id])
      expect((await getHooks()).find(hook => hook.assignmentId === later.assignment.id && hook.status === 'cancelled')).toBeDefined()
    })
  })
})
