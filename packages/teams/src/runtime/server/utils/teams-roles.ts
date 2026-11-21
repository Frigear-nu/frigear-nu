import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { table as authRoleTable } from '#auth/roles'
import type { SQL } from 'drizzle-orm'
import type { OwnerRef, TeamRoleGrant } from '@frigear-nu/audience'
import type { TeamMemberDto, TeamOwner, TeamRoleMappingDto, TeamsMembersCandidatesContext, TeamsResolverTeam, TeamsRolesResolveContext } from '../../../types'
import { isLeadRole } from '../../utils/ladders'
import { grantsOfOwner, isPlanMatch, isRoleMatch, mappedGrantsFor, mappingCoversTeam, mergeTeamGrants } from '../../utils/resolve'
import { teamsAuthorizationCandidatesQuery, teamsRolesGranting, teamsSubscriptionCandidatesQuery } from '../candidates'
import { toMappedTeamMemberDto, toTeamMemberDto, toTeamRoleMappingDto } from './teams-dto'
import { loadTeamLadders, teamLadderKeyMap } from './teams-ladders'

// Role resolution. Explicit memberships are rows; mapped ones come from `team_role_mappings` at read time and are never
// stored. Everything is cached per request (`event`), so call these freely within one request.

type Cache = {
  rules?: Promise<TeamRoleMappingDto[]>
  grants: Map<string, Promise<TeamRoleGrant[]>>
}
const caches = new WeakMap<H3Event, Cache>()

function cacheOf(event: H3Event | undefined): Cache | undefined {
  if (!event) return undefined
  let cache = caches.get(event)
  if (!cache) caches.set(event, cache = { grants: new Map() })
  return cache
}

/** Forgets what this request resolved, after a membership or a rule changed. */
export function forgetTeamRoles(event: H3Event): void {
  caches.delete(event)
}

/** Every mapping rule (a small table), cached per request. */
export function loadTeamMappingRules(event?: H3Event): Promise<TeamRoleMappingDto[]> {
  const cache = cacheOf(event)
  if (cache?.rules) return cache.rules
  const promise = db.select().from(schema.teamRoleMappings).then(rows => rows.map(toTeamRoleMappingDto))
  if (cache) cache.rules = promise
  return promise
}

const ownerCondition = (table: typeof schema.teams, owner: TeamOwner): SQL =>
  and(eq(table.ownerType, owner.ownerType), owner.ownerId === null ? isNull(table.ownerId) : eq(table.ownerId, owner.ownerId))!

/** The teams any of `rules` can apply to (the rule's team, or every team of the rule's owner). */
async function teamsCoveredBy(rules: readonly TeamRoleMappingDto[]): Promise<TeamsResolverTeam[]> {
  if (!rules.length) return []
  const conditions: SQL[] = []
  const teamIds = [...new Set(rules.flatMap(rule => rule.teamId ? [rule.teamId] : []))]
  if (teamIds.length) conditions.push(inArray(schema.teams.id, teamIds))
  const owners = new Map<string, TeamOwner>()
  for (const rule of rules) if (!rule.teamId) owners.set(`${rule.ownerType}\u0000${rule.ownerId ?? ''}`, rule)
  for (const owner of owners.values()) conditions.push(ownerCondition(schema.teams, owner))
  const rows = await db.select({ id: schema.teams.id, ownerType: schema.teams.ownerType, ownerId: schema.teams.ownerId, kind: schema.teams.kind })
    .from(schema.teams).where(or(...conditions))
  return rows.map(row => ({ ...row, ownerId: row.ownerId ?? null })).filter(team => rules.some(rule => mappingCoversTeam(rule, team)))
}

/** The global roles of a user (closed over `inherit`): auth's `getEffectiveRoles`, `[]` for an unknown user. */
export async function teamsGlobalRolesOf(event: H3Event | undefined, userId: string | number): Promise<string[]> {
  const user = await loadAuthUser(userId)
  return user ? getEffectiveRoles(event, user) : []
}

/**
 * Whether a membership row grants its role: `status` null or `'active'`. Any other status (crew's `pending`,
 * `inactive`, ...) keeps the row listed on the team but gives no grant: no read, no lead, nothing in the viewer.
 */
export function teamMemberStatusGrants(status: string | null | undefined): boolean {
  return status === null || status === undefined || status === 'active'
}

/** The explicit grants of a user: their membership rows that grant (`teamMemberStatusGrants`), on every owner. */
async function explicitGrantsOf(userId: number): Promise<TeamRoleGrant[]> {
  const rows = await db.select({
    teamId: schema.teamMembers.teamId,
    role: schema.teamMembers.role,
    ownerType: schema.teams.ownerType,
    ownerId: schema.teams.ownerId,
    kind: schema.teams.kind,
  }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teamMembers.userId, userId), or(isNull(schema.teamMembers.status), eq(schema.teamMembers.status, 'active'))))
  return rows.map(row => ({ ownerType: row.ownerType, ownerId: row.ownerId ?? null, teamId: row.teamId, kind: row.kind, role: row.role, source: 'explicit' as const }))
}

export type TeamsGrantOptions = {
  /** The user's global roles when the caller already has them (the viewer hook, the OAuth claim). */
  globalRoles?: string[]
}

/**
 * Every team role of a user on every owner: explicit memberships first, then one mapped grant per other team (role
 * rules from the global roles, plan rules and any other source through `teams:roles:resolve`). Explicit beats mapped
 * on the same team; between mapped rules the highest `priority` wins, then the higher role. Cached per request.
 */
export function resolveAllTeamRoles(event: H3Event | undefined, userId: string | number, options: TeamsGrantOptions = {}): Promise<TeamRoleGrant[]> {
  const cache = cacheOf(event)
  const key = String(userId)
  const cached = cache?.grants.get(key)
  if (cached) return cached
  const promise = computeTeamGrants(event, Number(userId), options)
  cache?.grants.set(key, promise)
  return promise
}

async function computeTeamGrants(event: H3Event | undefined, userId: number, options: TeamsGrantOptions): Promise<TeamRoleGrant[]> {
  if (!Number.isInteger(userId) || userId <= 0) return []
  const [explicit, rules, ladderRows] = await Promise.all([explicitGrantsOf(userId), loadTeamMappingRules(event), loadTeamLadders(event)])
  const ladders = teamLadderKeyMap(ladderRows)
  if (!rules.length) return mergeTeamGrants(explicit, [], ladders)

  const globalRoles = options.globalRoles ?? await teamsGlobalRolesOf(event, userId)
  const held = new Set(globalRoles)
  const roleRules = rules.filter(rule => isRoleMatch(rule.match) && held.has(rule.match.role))
  // Rules teams does not answer itself (`plan`, or a match a listener adds) stay in play for the listeners.
  const otherRules = rules.filter(rule => !isRoleMatch(rule.match))
  const inPlay = [...roleRules, ...otherRules]
  if (!inPlay.length) return mergeTeamGrants(explicit, [], ladders)

  const teams = await teamsCoveredBy(inPlay)
  const ctx: TeamsRolesResolveContext = {
    event,
    user: { id: userId },
    owner: null,
    globalRoles: [...globalRoles],
    rules: inPlay,
    teams,
    ladders,
    grants: mappedGrantsFor(teams, roleRules, ladders),
  }
  const own = [...ctx.grants]
  try {
    await useNitroApp().hooks.callHook('teams:roles:resolve', ctx)
  }
  catch (error) {
    // Fail closed: a listener that throws gives nobody anything. Its grants (and those of listeners after it) are
    // dropped; the explicit memberships and teams' own role rules still count.
    console.error('[teams] a teams:roles:resolve listener failed; its mapped grants are left out', error)
    return mergeTeamGrants(explicit, own, ladders)
  }
  return mergeTeamGrants(explicit, ctx.grants, ladders)
}

/**
 * The team roles `userId` holds on the teams of `owner` (the team-role contract of `@frigear-nu/audience`): explicit
 * memberships first, then mapped grants. Cached per request.
 */
export async function resolveTeamRoles(event: H3Event, userId: string | number, owner: OwnerRef): Promise<TeamRoleGrant[]> {
  return grantsOfOwner(await resolveAllTeamRoles(event, userId), { ownerType: owner.type, ownerId: owner.id ?? null })
}

/** The grant `userId` holds on one team, explicit or mapped, or `undefined`. */
export async function teamGrantOf(event: H3Event | undefined, userId: string | number, teamId: string): Promise<TeamRoleGrant | undefined> {
  return (await resolveAllTeamRoles(event, userId)).find(grant => grant.teamId === teamId)
}

/**
 * Whether `userId` leads team `teamId`: they hold a role (explicit or mapped) at or above the `leadFrom` of the team
 * kind's ladder. For other modules' policies (`isTeamLead(event, user.id, record.teamId)`).
 */
export async function isTeamLead(event: H3Event | undefined, userId: string | number, teamId: string): Promise<boolean> {
  const grant = await teamGrantOf(event, userId, teamId)
  if (!grant) return false
  const ladder = (await loadTeamLadders(event))[grant.kind]
  return isLeadRole(ladder?.roles.map(role => role.key), grant.role, ladder?.leadFrom)
}

/** The most mapped candidates `teamMembers(..., { mapped: true })` checks, so a huge mapping cannot stall a request. */
export const TEAMS_MAPPED_CANDIDATE_LIMIT = 1000

type UserFields = { name: string | null, email: string | null, avatar: string | null }

async function usersById(ids: number[]): Promise<Map<number, UserFields>> {
  if (!ids.length) return new Map()
  const rows = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, avatar: schema.users.avatar })
    .from(schema.users).where(inArray(schema.users.id, ids))
  return new Map(rows.map(row => [Number(row.id), { name: row.name ?? null, email: row.email ?? null, avatar: row.avatar ?? null }]))
}

type CandidateTables = {
  authorizationUserRoles?: Parameters<typeof teamsAuthorizationCandidatesQuery>[1]
  subscriptions?: Parameters<typeof teamsSubscriptionCandidatesQuery>[1]
}

/** Runs one candidate source; a failing source is logged and adds nobody. */
async function candidateSource(name: string, run: () => Promise<unknown>): Promise<number[]> {
  try {
    return ((await run()) as Array<{ userId: unknown }>).map(row => Number(row.userId))
  }
  catch (error) {
    console.error(`[teams] the ${name} candidates of mapped members could not be read; they are left out`, error)
    return []
  }
}

/**
 * The candidates teams knows itself: users assigned a role a rule names, or a role inheriting one (`authorization`),
 * and users with an entitled subscription to a plan a rule names (`subscriptions`).
 */
async function builtInCandidates(rules: readonly TeamRoleMappingDto[]): Promise<number[]> {
  const ids: number[] = []
  const tables = schema as unknown as CandidateTables
  const roles = [...new Set(rules.flatMap(rule => isRoleMatch(rule.match) ? [rule.match.role] : []))]
  if (roles.length && tables.authorizationUserRoles) {
    const granting = teamsRolesGranting(authRoleTable.roles, roles)
    ids.push(...await candidateSource('authorization', async () => teamsAuthorizationCandidatesQuery(db, tables.authorizationUserRoles!, granting, TEAMS_MAPPED_CANDIDATE_LIMIT)))
  }
  const plans = [...new Set(rules.flatMap(rule => isPlanMatch(rule.match) ? [rule.match.plan] : []))]
  if (plans.length && tables.subscriptions) {
    ids.push(...await candidateSource('subscriptions', async () => teamsSubscriptionCandidatesQuery(db, tables.subscriptions!, plans, TEAMS_MAPPED_CANDIDATE_LIMIT)))
  }
  return ids
}

export type TeamMembersOptions = {
  /** Also list the mapped members (on demand: every candidate is resolved). */
  mapped?: boolean
  /** Copy the members' emails into the DTOs (the caller holds `teams:pii`). */
  pii?: boolean
  /** Keep the membership `status` in the DTOs (the caller manages or leads the team); otherwise it is left out. */
  status?: boolean
}

/**
 * The members of a team: the explicit rows (by role, then name), and with `mapped: true` the users who hold a mapped
 * role on it. Mapped candidates come from authorization's assigned roles, the subscribers of mapped plans and
 * `teams:members:candidates` listeners; a role granted only through `defaultRoles`, an `auto` role or the
 * `authorization:roles` hook cannot be enumerated and is not listed. At most {@link TEAMS_MAPPED_CANDIDATE_LIMIT}
 * candidates are checked.
 */
export async function teamMembers(event: H3Event, teamId: string, options: TeamMembersOptions = {}): Promise<TeamMemberDto[]> {
  const pii = options.pii ?? false
  const [team] = await db.select({ id: schema.teams.id, ownerType: schema.teams.ownerType, ownerId: schema.teams.ownerId, kind: schema.teams.kind })
    .from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1)
  if (!team) return []
  const resolverTeam: TeamsResolverTeam = { ...team, ownerId: team.ownerId ?? null }
  const rows = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId))
  const explicitIds = new Set(rows.map(row => row.userId))
  const mapped: Array<{ userId: number, role: string }> = []

  if (options.mapped) {
    const rules = (await loadTeamMappingRules(event)).filter(rule => mappingCoversTeam(rule, resolverTeam))
    if (rules.length) {
      const ctx: TeamsMembersCandidatesContext = { event, team: resolverTeam, rules, userIds: new Set(await builtInCandidates(rules)) }
      try {
        await useNitroApp().hooks.callHook('teams:members:candidates', ctx)
      }
      catch (error) {
        console.error('[teams] a teams:members:candidates listener failed; the candidates found so far are checked', error)
      }
      const candidates = [...ctx.userIds].filter(id => Number.isInteger(id) && id > 0 && !explicitIds.has(id)).slice(0, TEAMS_MAPPED_CANDIDATE_LIMIT)
      for (const userId of candidates) {
        const grant = await teamGrantOf(event, userId, teamId)
        if (grant?.source === 'mapped') mapped.push({ userId, role: grant.role })
      }
    }
  }

  const users = await usersById([...explicitIds, ...mapped.map(item => item.userId)])
  const keys = (await loadTeamLadders(event))[team.kind]?.roles.map(role => role.key) ?? []
  const all = [
    ...rows.map(row => toTeamMemberDto(row, users.get(row.userId), pii)),
    ...mapped.map(item => toMappedTeamMemberDto(teamId, item.userId, item.role, users.get(item.userId), pii)),
  ]
  const members = options.status === false ? all.map(({ status: _status, ...member }) => member as TeamMemberDto) : all
  // Highest role first, then by name: leads at the top.
  return members.sort((a, b) => keys.indexOf(b.role) - keys.indexOf(a.role) || (a.name ?? '').localeCompare(b.name ?? '') || a.userId - b.userId)
}
