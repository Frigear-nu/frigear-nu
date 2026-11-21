import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import type { ApiMethod } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { teamsApi } from '../src/runtime/utils/api'
import { teamsAccess } from '../src/runtime/access'
import { mapsApi } from '@frigear-nu/maps/api'
import { getHooksFor, getOwner, givePlan, registerUser } from './helpers'

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
  return (await ok(await json(cookie, 'POST', authApi.me.tokens, { name: 'test', scopes }))).token as string
}

describe('teams (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  let staff: Session
  const user = (name: string, domain = 'example.com') => registerUser(name, `${name.toLowerCase()}${++counter}@${domain}`)

  beforeAll(async () => {
    staff = await registerUser('Staff', 'staff@staff.test')
  })

  const createTeam = async (overrides: Json = {}): Promise<Json> => ok(await json(staff.cookie, 'POST', teamsApi.admin.teams, {
    ownerType: 'operation',
    ownerId: 'opr_roskilde',
    kind: 'bar',
    name: { en: `Bar ${++counter}`, da: `Bar ${counter}` },
    ...overrides,
  }))
  const createRule = async (body: Json): Promise<Json> => ok(await json(staff.cookie, 'POST', teamsApi.admin.mappings, { ownerType: 'operation', ownerId: 'opr_roskilde', ...body }))
  const addMember = (teamId: string, userId: number, role: string) => json(staff.cookie, 'POST', teamsApi.admin.members(teamId), { userId, role })
  const myTeams = async (cookie: string) => ok(await json(cookie, 'GET', teamsApi.me.teams)) as unknown as Promise<Json[]>

  describe('ladders', () => {
    it('stores the option\'s ladders on the first request, the bar ladder by default', async () => {
      const rows = await $fetch<Json[]>('/api/test/ladders')
      const bar = rows.find(row => row.kind === 'bar')
      expect(bar?.roles.map((role: Json) => role.key)).toEqual(['volunteer', 'bartender', 'ba', 'coordinator'])
      expect(bar?.leadFrom).toBe('ba')
      expect(rows.find(row => row.kind === 'firstaid')?.roles.map((role: Json) => role.key)).toEqual(['helper', 'medic'])
      const listed = await ok(await json(staff.cookie, 'GET', teamsApi.admin.ladders)) as unknown as Json[]
      expect(listed.find(ladder => ladder.kind === 'bar')).toMatchObject({ source: 'stored', leadFrom: 'ba' })
    })

    it('edits a ladder, and refuses to remove a role still in use (409 team_role_in_use)', async () => {
      const team = await createTeam({ kind: 'firstaid' })
      const someone = await user('Medic')
      await ok(await addMember(team.id, someone.id, 'medic'))
      const withoutMedic = { roles: [{ key: 'helper', label: 'Helper' }], leadFrom: null }
      await expectApiError(json(staff.cookie, 'PUT', teamsApi.admin.ladder('firstaid'), withoutMedic), 409, 'team_role_in_use')
      const saved = await ok(await json(staff.cookie, 'PUT', teamsApi.admin.ladder('firstaid'), {
        roles: [{ key: 'helper', label: 'Helper' }, { key: 'medic', label: 'Medic' }, { key: 'lead-medic', label: 'Lead medic' }],
        leadFrom: 'lead-medic',
      }))
      expect(saved).toMatchObject({ kind: 'firstaid', leadFrom: 'lead-medic', source: 'stored' })
      expect((await json(staff.cookie, 'PUT', teamsApi.admin.ladder('firstaid'), { roles: [{ key: 'Bad Key', label: 'x' }] })).status).toBe(400)

      // A rule for every team of an owner that has a firstaid team keeps its role on the ladder too.
      await createRule({ match: { role: 'barmanager' }, teamRole: 'lead-medic' })
      const withoutLead = { roles: [{ key: 'helper', label: 'Helper' }, { key: 'medic', label: 'Medic' }], leadFrom: 'medic' }
      const refused = await json(staff.cookie, 'PUT', teamsApi.admin.ladder('firstaid'), withoutLead)
      expect(refused.status).toBe(409)
      expect((await refused.json() as Json).data).toMatchObject({ code: 'team_role_in_use', roles: ['lead-medic'] })
      expect((await json(staff.cookie, 'PUT', teamsApi.admin.ladder('firstaid'), { roles: [{ key: 'a', label: 'A' }], leadFrom: 'b' })).status).toBe(400)
    })
  })

  describe('access', () => {
    it('denies the admin API by default: anonymous 401, non-staff 403', async () => {
      const nobody = await user('Nobody')
      expect((await json(undefined, 'GET', teamsApi.admin.teams)).status).toBe(401)
      expect((await json(undefined, 'GET', teamsApi.admin.team('tem_missing'))).status).toBe(401)
      expect((await json(undefined, 'DELETE', teamsApi.admin.member('tem_missing', 1))).status).toBe(401)
      expect((await json(undefined, 'GET', teamsApi.me.teams)).status).toBe(401)
      await expectApiError(json(nobody.cookie, 'GET', teamsApi.admin.teams), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'GET', teamsApi.admin.team('tem_missing')), 403, 'forbidden')
      await expectApiError(json(nobody.cookie, 'POST', teamsApi.admin.mappings, {}), 403, 'forbidden')
    })

    it('reads /me with a teams:read token or the teams scope, and refuses a token without (insufficient_scope)', async () => {
      const someone = await user('Scoped')
      const team = await createTeam()
      await ok(await addMember(team.id, someone.id, 'bartender'))
      for (const scope of [teamsAccess.permissions.read, 'teams']) {
        const client = apiClient({ bearer: await createToken(someone.cookie, [scope]) })
        const grants = await client.json<Json[]>('GET', teamsApi.me.teams)
        expect(grants.find(grant => grant.teamId === team.id)).toMatchObject({ role: 'bartender', source: 'explicit' })
      }
      const other = apiClient({ bearer: await createToken(someone.cookie, [teamsAccess.permissions.lead]) })
      await expectApiError(other.json('GET', teamsApi.me.teams), 403, 'insufficient_scope')
      await expectApiError(other.json('GET', teamsApi.members(team.id)), 403, 'insufficient_scope')
    })

    it('refuses a staff token without teams:manage on the admin API (insufficient_scope)', async () => {
      const readOnly = apiClient({ bearer: await createToken(staff.cookie, [teamsAccess.permissions.read]) })
      await expectApiError(readOnly.json('GET', teamsApi.admin.teams), 403, 'insufficient_scope')
      const manage = apiClient({ bearer: await createToken(staff.cookie, [teamsAccess.permissions.manage]) })
      expect((await manage.json<Json>('GET', teamsApi.admin.teams)).items).toBeDefined()
    })

    it('lets teams:* manage teams but never reach teams:pii (no emails)', async () => {
      const wild = await registerUser('Wild', `wild${++counter}@wild.test`)
      const team = await createTeam()
      const someone = await user('Hidden')
      await ok(await addMember(team.id, someone.id, 'volunteer'))
      const members = await ok(await json(wild.cookie, 'GET', teamsApi.members(team.id))) as unknown as Json[]
      expect(members.map(member => member.userId)).toContain(someone.id)
      expect(members.every(member => !('email' in member))).toBe(true)

      const wildToken = apiClient({ bearer: await createToken(staff.cookie, ['teams:*']) })
      const viaToken = await wildToken.json<Json[]>('GET', teamsApi.members(team.id))
      expect(viaToken.every(member => !('email' in member))).toBe(true)
      const users = await wildToken.json<Json[]>('GET', `${teamsApi.admin.users}?q=hidden`)
      expect(users.length).toBeGreaterThan(0)
      expect(users.every(found => !('email' in found))).toBe(true)
      // Without teams:pii the lookup never matches on the email, so it cannot probe addresses.
      const domain = 'example.com'
      expect(await wildToken.json<Json[]>('GET', `${teamsApi.admin.users}?q=${domain}`)).toEqual([])
      const asStaff = await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.users}?q=${domain}`)) as unknown as Json[]
      expect(asStaff.length).toBeGreaterThan(0)
    })

    it('shows emails with teams:pii only, and a team only to its members and staff', async () => {
      const team = await createTeam()
      const member = await user('Insider')
      const outsider = await user('Outsider')
      await ok(await addMember(team.id, member.id, 'volunteer'))

      const asStaff = await ok(await json(staff.cookie, 'GET', teamsApi.members(team.id))) as unknown as Json[]
      expect(asStaff.find(item => item.userId === member.id)?.email).toMatch(/@example\.com$/)
      const asMember = await ok(await json(member.cookie, 'GET', teamsApi.members(team.id))) as unknown as Json[]
      expect(asMember.find(item => item.userId === member.id)).toMatchObject({ name: 'Insider', role: 'volunteer', source: 'explicit' })
      expect(asMember.every(item => !('email' in item))).toBe(true)

      // The membership status is for staff and leads only.
      expect(asStaff.find(item => item.userId === member.id)).toHaveProperty('status', null)
      expect(asMember.every(item => !('status' in item))).toBe(true)
      // Mapped members are listed for staff and leads only.
      await expectApiError(json(member.cookie, 'GET', `${teamsApi.members(team.id)}?include=mapped`), 403, 'forbidden')
      expect(await ok(await json(member.cookie, 'GET', teamsApi.team(team.id)))).toMatchObject({ id: team.id, kind: 'bar' })
      await expectApiError(json(outsider.cookie, 'GET', teamsApi.team(team.id)), 403, 'forbidden')
      await expectApiError(json(outsider.cookie, 'GET', teamsApi.members(team.id)), 403, 'forbidden')
      // 401 before 404.
      expect((await json(undefined, 'GET', teamsApi.team('tem_missing'))).status).toBe(401)
      await expectApiError(json(staff.cookie, 'GET', teamsApi.team('tem_missing')), 404, 'not_found')
    })
  })

  describe('teams and owners', () => {
    it('creates a platform team with a null owner id, and an operation team for a known operation', async () => {
      const platform = await createTeam({ ownerType: 'platform', ownerId: null, kind: 'firstaid', name: 'First aid' })
      expect(platform).toMatchObject({ ownerType: 'platform', ownerId: null, ownerLabel: null, memberCount: 0 })
      expect(platform.id).toMatch(/^tem_/)
      const bar = await createTeam({ capacity: 12, description: { en: 'Main bar' } })
      expect(bar).toMatchObject({ ownerType: 'operation', ownerId: 'opr_roskilde', ownerLabel: 'Roskilde 2027 bar operation', capacity: 12 })

      const listed = await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.teams}?ownerType=platform&pageSize=100`))
      expect(listed.items.map((item: Json) => item.id)).toContain(platform.id)
      expect(listed.items.map((item: Json) => item.id)).not.toContain(bar.id)
      const byOwner = await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.teams}?ownerType=operation&ownerId=opr_roskilde&pageSize=100`))
      expect(byOwner.items.map((item: Json) => item.id)).toContain(bar.id)

      const patched = await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.team(bar.id), { name: 'Renamed bar', capacity: null }))
      expect(patched).toMatchObject({ name: 'Renamed bar', capacity: null, kind: 'bar' })
    })

    it('validates the owner, the kind and the parent (400)', async () => {
      const base = { kind: 'bar', name: 'Nope' }
      for (const body of [
        { ...base, ownerType: 'operation', ownerId: 'opr_unknown' },
        { ...base, ownerType: 'operation', ownerId: null },
        { ...base, ownerType: 'galaxy', ownerId: 'x' },
        { ...base, ownerType: 'platform', ownerId: 'something' },
        { ...base, ownerType: 'platform', ownerId: null, kind: 'unknown-kind' },
        { ...base, ownerType: 'platform', ownerId: null, parentId: 'tem_missing' },
        { ownerType: 'platform', kind: 'bar' },
      ]) {
        expect((await json(staff.cookie, 'POST', teamsApi.admin.teams, body)).status, JSON.stringify(body)).toBe(400)
      }
    })

    it('answers audience:owner:resolve for teams', async () => {
      const team = await createTeam({ name: { en: 'Owner bar', da: 'Ejerbar' } })
      expect(await getOwner('team', team.id)).toEqual({ label: { en: 'Owner bar', da: 'Ejerbar' }, exists: true })
      expect(await getOwner('team', 'tem_missing')).toEqual({ label: null, exists: false })
    })

    it('deletes a team with its members and its own rules (foreign key cascades)', async () => {
      const team = await createTeam()
      const someone = await user('Gone')
      await ok(await addMember(team.id, someone.id, 'volunteer'))
      await createRule({ teamId: team.id, match: { role: 'barmanager' }, teamRole: 'bartender' })
      const rows = () => $fetch<Json>('/api/test/member-rows', { query: { teamId: team.id } })
      expect(await rows()).toEqual({ members: 1, rules: 1 })
      expect((await json(staff.cookie, 'DELETE', teamsApi.admin.team(team.id))).status).toBe(204)
      expect(await rows()).toEqual({ members: 0, rules: 0 })
      await expectApiError(json(staff.cookie, 'GET', teamsApi.admin.team(team.id)), 404, 'not_found')
      expect((await myTeams(someone.cookie)).find(grant => grant.teamId === team.id)).toBeUndefined()
    })
  })

  describe('members', () => {
    it('adds, changes and removes a member, firing the hooks', async () => {
      const team = await createTeam()
      const someone = await user('Hooked')
      const added = await ok(await addMember(team.id, someone.id, 'volunteer'))
      expect(added).toMatchObject({ userId: someone.id, role: 'volunteer', source: 'explicit', name: 'Hooked' })
      expect(added.id).toMatch(/^tmm_/)
      expect(added.email).toMatch(/@example\.com$/)

      await expectApiError(addMember(team.id, someone.id, 'bartender'), 409, 'conflict')
      expect(await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { role: 'bartender' }))).toMatchObject({ role: 'bartender' })
      // A status change alone fires no role hook.
      expect(await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { status: 'approved' }))).toMatchObject({ status: 'approved' })
      expect((await json(staff.cookie, 'DELETE', teamsApi.admin.member(team.id, someone.id))).status).toBe(204)
      await expectApiError(json(staff.cookie, 'DELETE', teamsApi.admin.member(team.id, someone.id)), 404, 'not_found')

      expect((await getHooksFor(team.id)).map(hook => [hook.name, hook.role, hook.from, hook.to])).toEqual([
        ['added', 'volunteer', undefined, undefined],
        ['role-changed', 'bartender', 'volunteer', 'bartender'],
        ['removed', 'bartender', undefined, undefined],
      ])
    })

    it('refuses a role that is not on the team kind\'s ladder, and an unknown user (400)', async () => {
      const team = await createTeam()
      const someone = await user('Laddered')
      expect((await addMember(team.id, someone.id, 'medic')).status).toBe(400)
      expect((await addMember(team.id, 999_999, 'volunteer')).status).toBe(400)
      await ok(await addMember(team.id, someone.id, 'volunteer'))
      expect((await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { role: 'medic' })).status).toBe(400)
    })
  })

  describe('role mapping', () => {
    it('shows a global barmanager as BA in every bar team of the operation, mapped, and lets an explicit assignment override it', async () => {
      const team = await createTeam()
      const other = await createTeam()
      const rule = await createRule({ match: { role: 'barmanager' }, teamRole: 'ba' })
      expect(rule).toMatchObject({ teamId: null, match: { role: 'barmanager' }, teamRole: 'ba', priority: 0 })

      const manager = await user('Manager', 'bar.test')
      const grants = await myTeams(manager.cookie)
      expect(grants.find(grant => grant.teamId === team.id)).toMatchObject({ ownerType: 'operation', ownerId: 'opr_roskilde', kind: 'bar', role: 'ba', source: 'mapped' })
      expect(grants.find(grant => grant.teamId === other.id)).toMatchObject({ role: 'ba', source: 'mapped' })
      // A plain member holds no mapped role from this rule.
      const member = await user('Plain', 'member.test')
      expect((await myTeams(member.cookie)).filter(grant => grant.teamId === team.id)).toEqual([])

      // Mapped members are listed on demand.
      const plain = await ok(await json(staff.cookie, 'GET', teamsApi.members(team.id))) as unknown as Json[]
      expect(plain.find(item => item.userId === manager.id)).toBeUndefined()
      const withMapped = await ok(await json(staff.cookie, 'GET', `${teamsApi.members(team.id)}?include=mapped`)) as unknown as Json[]
      expect(withMapped.find(item => item.userId === manager.id)).toMatchObject({ id: null, role: 'ba', source: 'mapped', status: null })

      await ok(await addMember(team.id, manager.id, 'bartender'))
      const after = await myTeams(manager.cookie)
      expect(after.filter(grant => grant.teamId === team.id)).toEqual([expect.objectContaining({ role: 'bartender', source: 'explicit' })])
      expect(after.find(grant => grant.teamId === other.id)).toMatchObject({ role: 'ba', source: 'mapped' })
      // Explicit grants come first.
      expect(after[0]).toMatchObject({ source: 'explicit' })

      expect((await json(staff.cookie, 'DELETE', teamsApi.admin.mapping(rule.id))).status).toBe(204)
      expect((await myTeams(manager.cookie)).find(grant => grant.teamId === other.id)).toBeUndefined()
    })

    it('picks between matching rules by priority, then by the higher role', async () => {
      const owner = { ownerType: 'operation', ownerId: 'opr_priority' }
      const team = await createTeam(owner)
      // `barmanager` inherits `member`, so both rules match a bar manager.
      await createRule({ ...owner, match: { role: 'barmanager' }, teamRole: 'ba' })
      const volunteerRule = await createRule({ ...owner, match: { role: 'member' }, teamRole: 'volunteer' })
      const manager = await user('Ranked', 'bar.test')
      expect((await myTeams(manager.cookie)).find(grant => grant.teamId === team.id)).toMatchObject({ role: 'ba' })

      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.mapping(volunteerRule.id), { priority: 10 }))
      expect((await myTeams(manager.cookie)).find(grant => grant.teamId === team.id)).toMatchObject({ role: 'volunteer', source: 'mapped' })

      const member = await user('Member', 'member.test')
      expect((await myTeams(member.cookie)).find(grant => grant.teamId === team.id)).toMatchObject({ role: 'volunteer', source: 'mapped' })
    })

    it('maps a plan through teams:roles:resolve, on a platform team', async () => {
      const team = await createTeam({ ownerType: 'platform', ownerId: null, name: 'Plan bar' })
      await createRule({ ownerType: 'platform', ownerId: null, teamId: team.id, match: { plan: 'yearly' }, teamRole: 'volunteer' })
      const subscriber = await user('Subscriber')
      expect((await myTeams(subscriber.cookie)).find(grant => grant.teamId === team.id)).toBeUndefined()
      await givePlan(subscriber.cookie, 'yearly')
      expect((await myTeams(subscriber.cookie)).find(grant => grant.teamId === team.id)).toMatchObject({ ownerType: 'platform', ownerId: null, role: 'volunteer', source: 'mapped' })
    })

    it('validates rules: a strict match, the team of the owner and a role on the ladder (400)', async () => {
      const team = await createTeam()
      const elsewhere = await createTeam({ ownerType: 'platform', ownerId: null })
      for (const body of [
        { match: { role: 'x', plan: 'y' }, teamRole: 'ba' },
        { match: { permission: 'x' }, teamRole: 'ba' },
        { match: { role: 'barmanager' }, teamRole: 'medic', teamId: team.id },
        { match: { role: 'barmanager' }, teamRole: 'nowhere' },
        { match: { role: 'barmanager' }, teamRole: 'ba', teamId: elsewhere.id },
        { match: { role: 'barmanager' }, teamRole: 'ba', ownerId: 'opr_unknown' },
      ]) {
        expect((await json(staff.cookie, 'POST', teamsApi.admin.mappings, { ownerType: 'operation', ownerId: 'opr_roskilde', ...body })).status, JSON.stringify(body)).toBe(400)
      }
      const listed = await ok(await json(staff.cookie, 'GET', `${teamsApi.admin.mappings}?teamId=${team.id}`)) as unknown as Json[]
      expect(listed.every(rule => rule.ownerId === 'opr_roskilde')).toBe(true)
    })
  })

  describe('lead policy', () => {
    it('lets a BA lead their team and not a volunteer, mapped grants included', async () => {
      const team = await createTeam()
      const ba = await user('Lead')
      const volunteer = await user('Helper')
      await ok(await addMember(team.id, ba.id, 'ba'))
      await ok(await addMember(team.id, volunteer.id, 'volunteer'))
      const lead = (cookie: string) => $fetch<Json>('/api/test/lead', { headers: { cookie }, query: { teamId: team.id } })
      expect(await lead(ba.cookie)).toEqual({ allowed: true, isTeamLead: true })
      expect(await lead(volunteer.cookie)).toEqual({ allowed: false, isTeamLead: false })

      const scoped = { ownerType: 'operation', ownerId: 'opr_priority' }
      const mappedTeam = await createTeam(scoped)
      await createRule({ ...scoped, teamId: mappedTeam.id, match: { role: 'barmanager' }, teamRole: 'coordinator', priority: 100 })
      const manager = await user('Mapped', 'bar.test')
      expect(await $fetch<Json>('/api/test/lead', { headers: { cookie: manager.cookie }, query: { teamId: mappedTeam.id } })).toEqual({ allowed: true, isTeamLead: true })
    })
  })

  describe('maps (installed in this fixture)', () => {
    const marker = { featureKind: 'maps.marker', geometry: { type: 'Point', coordinates: [12, 55] } }
    const createMap = async (ownerType: string, ownerId: string | null): Promise<Json> =>
      ok(await json(staff.cookie, 'POST', mapsApi.admin.maps, { kind: 'maps.generic-geo', ownerType, ownerId, name: `Map ${++counter}` }))

    it('lets a team\'s leads draw on the maps the team owns, and nobody else', async () => {
      const team = await createTeam()
      const otherTeam = await createTeam()
      const lead = await user('Maplead')
      const volunteer = await user('Mapvolunteer')
      const stranger = await user('Mapstranger')
      await ok(await addMember(team.id, lead.id, 'ba'))
      await ok(await addMember(team.id, volunteer.id, 'volunteer'))
      const owned = await createMap('team', team.id)
      const others = await createMap('team', otherTeam.id)
      const operationMap = await createMap('operation', 'opr_roskilde')

      expect((await ok(await json(lead.cookie, 'POST', mapsApi.features(owned.id), marker))).featureKind).toBe('maps.marker')
      expect((await ok(await json(lead.cookie, 'GET', mapsApi.map(owned.id)))).canEdit).toBe(true)
      // A volunteer of the team, a stranger, and a lead of another team's map or of an operation's map are refused.
      await expectApiError(json(volunteer.cookie, 'POST', mapsApi.features(owned.id), marker), 403, 'forbidden')
      await expectApiError(json(stranger.cookie, 'POST', mapsApi.features(owned.id), marker), 403, 'forbidden')
      await expectApiError(json(lead.cookie, 'POST', mapsApi.features(others.id), marker), 403, 'forbidden')
      await expectApiError(json(lead.cookie, 'POST', mapsApi.features(operationMap.id), marker), 403, 'forbidden')
      expect((await ok(await json(volunteer.cookie, 'GET', mapsApi.map(owned.id)))).canEdit).toBe(false)
      // Staff keep editing through maps:manage.
      expect((await ok(await json(staff.cookie, 'POST', mapsApi.features(owned.id), marker))).id).toMatch(/^mpf_/)
    })

    it('counts a mapped lead and lets a token with the maps permissions draw as that lead', async () => {
      const scoped = { ownerType: 'operation', ownerId: 'opr_maps_mapped' }
      const team = await createTeam(scoped)
      await createRule({ ...scoped, teamId: team.id, match: { role: 'barmanager' }, teamRole: 'coordinator', priority: 100 })
      const manager = await user('Mapmapped', 'bar.test')
      const owned = await createMap('team', team.id)
      expect((await ok(await json(manager.cookie, 'POST', mapsApi.features(owned.id), marker))).featureKind).toBe('maps.marker')
      // The listener reads `ctx.user`, so a bearer request is judged by its user and the token's own scopes.
      const bearer = apiClient({ bearer: await createToken(manager.cookie, ['maps:read', 'maps:edit']) })
      expect((await bearer.json<Json>('POST', mapsApi.features(owned.id), marker)).featureKind).toBe('maps.marker')
    })
  })

  describe('audience:viewer:resolve', () => {
    it('fills the viewer\'s team roles and the ladders of their kinds', async () => {
      const team = await createTeam()
      const someone = await user('Viewer')
      await ok(await addMember(team.id, someone.id, 'bartender'))
      const viewer = await $fetch<Json>('/api/test/viewer', { headers: { cookie: someone.cookie } })
      expect(viewer.teamRoles).toContainEqual({ ownerType: 'operation', ownerId: 'opr_roskilde', teamId: team.id, kind: 'bar', role: 'bartender', source: 'explicit' })
      expect(viewer.ladders.bar).toEqual(['volunteer', 'bartender', 'ba', 'coordinator'])
    })
  })

  describe('membership status', () => {
    it('lists a pending member without a grant: no read, no lead, nothing in the viewer or /me', async () => {
      const team = await createTeam()
      const pending = await user('Pending')
      await ok(await json(staff.cookie, 'POST', teamsApi.admin.members(team.id), { userId: pending.id, role: 'ba', status: 'pending' }))

      const listed = await ok(await json(staff.cookie, 'GET', teamsApi.members(team.id))) as unknown as Json[]
      expect(listed.find(item => item.userId === pending.id)).toMatchObject({ role: 'ba', status: 'pending', source: 'explicit' })
      expect((await myTeams(pending.cookie)).find(grant => grant.teamId === team.id)).toBeUndefined()
      await expectApiError(json(pending.cookie, 'GET', teamsApi.team(team.id)), 403, 'forbidden')
      expect(await $fetch<Json>('/api/test/lead', { headers: { cookie: pending.cookie }, query: { teamId: team.id } })).toEqual({ allowed: false, isTeamLead: false })
      const viewer = await $fetch<Json>('/api/test/viewer', { headers: { cookie: pending.cookie } })
      expect(viewer.teamRoles.find((grant: Json) => grant.teamId === team.id)).toBeUndefined()

      // `active` grants like `null`.
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, pending.id), { status: 'active' }))
      expect((await myTeams(pending.cookie)).find(grant => grant.teamId === team.id)).toMatchObject({ role: 'ba', source: 'explicit' })
      expect(await $fetch<Json>('/api/test/lead', { headers: { cookie: pending.cookie }, query: { teamId: team.id } })).toEqual({ allowed: true, isTeamLead: true })
    })

    it('fires added and removed when the status starts or ends the grant, not for rows without one', async () => {
      const team = await createTeam()
      const someone = await user('Statused')
      await ok(await json(staff.cookie, 'POST', teamsApi.admin.members(team.id), { userId: someone.id, role: 'volunteer', status: 'pending' }))
      // A role change without a grant fires nothing; the grant starts with the role it has then.
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { role: 'bartender' }))
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { status: 'active' }))
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { role: 'ba' }))
      // `active` -> null both grant: nothing to tell.
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { status: null }))
      await ok(await json(staff.cookie, 'PATCH', teamsApi.admin.member(team.id, someone.id), { status: 'inactive' }))
      expect((await myTeams(someone.cookie)).find(grant => grant.teamId === team.id)).toBeUndefined()
      // Deleting a row without a grant fires nothing either.
      expect((await json(staff.cookie, 'DELETE', teamsApi.admin.member(team.id, someone.id))).status).toBe(204)

      expect((await getHooksFor(team.id)).map(hook => [hook.name, hook.role, hook.from, hook.to])).toEqual([
        ['added', 'bartender', undefined, undefined],
        ['role-changed', 'ba', 'bartender', 'ba'],
        ['removed', 'ba', undefined, undefined],
      ])
    })
  })

  describe('failing sources', () => {
    it('drops the grants of a throwing teams:roles:resolve listener and keeps explicit and role grants', async () => {
      const owner = { ownerType: 'operation', ownerId: 'opr_priority' }
      const explicitTeam = await createTeam(owner)
      const mappedTeam = await createTeam(owner)
      const manager = await user('Failing', 'bar.test')
      await ok(await addMember(explicitTeam.id, manager.id, 'volunteer'))
      await $fetch('/api/test/fail-resolve', { method: 'POST', headers: { cookie: manager.cookie } })

      const grants = await myTeams(manager.cookie)
      expect(grants.find(grant => grant.teamId === explicitTeam.id)).toMatchObject({ role: 'volunteer', source: 'explicit' })
      // The listener pushed `coordinator` with priority 1000 before throwing: dropped. Teams' own rules still apply.
      expect(grants.find(grant => grant.teamId === mappedTeam.id)).toMatchObject({ role: 'volunteer', source: 'mapped' })
      const viewer = await $fetch<Json>('/api/test/viewer', { headers: { cookie: manager.cookie } })
      expect(viewer.teamRoles.find((grant: Json) => grant.teamId === explicitTeam.id)).toMatchObject({ role: 'volunteer' })
    })
  })

  describe('viewer for other callers', () => {
    it('fills the viewer for a bearer-token request and for a user other than the caller', async () => {
      const team = await createTeam()
      const someone = await user('Bearer')
      await ok(await addMember(team.id, someone.id, 'bartender'))
      const token = await createToken(someone.cookie, [teamsAccess.permissions.read])
      const viaBearer = await $fetch<Json>('/api/test/viewer', { headers: { authorization: `Bearer ${token}` } })
      expect(viaBearer.teamRoles.find((grant: Json) => grant.teamId === team.id)).toMatchObject({ role: 'bartender', source: 'explicit' })
      expect(viaBearer.ladders.bar).toEqual(['volunteer', 'bartender', 'ba', 'coordinator'])

      const ofOther = await $fetch<Json>('/api/test/viewer', { headers: { cookie: staff.cookie }, query: { userId: someone.id } })
      expect(ofOther.userId).toBe(someone.id)
      expect(ofOther.teamRoles.find((grant: Json) => grant.teamId === team.id)).toMatchObject({ role: 'bartender' })
      // The caller's own grants are not mixed in.
      const mine = await $fetch<Json>('/api/test/viewer', { headers: { cookie: staff.cookie } })
      expect(mine.teamRoles.find((grant: Json) => grant.teamId === team.id)).toBeUndefined()
    })
  })

  describe('pages', () => {
    it('renders the team list and a team page for staff', async () => {
      const team = await createTeam({ name: 'Page test bar' })
      const list = await fetch('/admin/teams', { headers: { cookie: staff.cookie } })
      expect(list.status).toBe(200)
      expect(await list.text()).toContain('Teams')
      const page = await fetch(`/admin/teams/${team.id}`, { headers: { cookie: staff.cookie } })
      expect(page.status).toBe(200)
      const html = await page.text()
      expect(html).toContain('Page test bar')
      expect(html).toContain('Role mapping rules')
    }, 180_000)

    it('keeps the admin pages behind teams:manage', async () => {
      const nobody = await user('Pagenobody')
      const html = await (await fetch('/admin/teams', { headers: { cookie: nobody.cookie } })).text()
      expect(html).toContain('You do not have access to teams')
    }, 180_000)
  })
})
