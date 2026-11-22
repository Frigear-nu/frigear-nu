import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { OwnerRef, TeamRoleGrant, TeamMemberDto, TeamOwner, TeamRoleMappingDto, TeamsMembersCandidatesContext, TeamsResolverTeam, TeamsRolesResolveContext } from '../../../types'
import { isLeadRole } from '../../utils/ladders'
import { grantsOfOwner, isPlanMatch, isRoleMatch, mappedGrantsFor, mappingCoversTeam, mergeTeamGrants } from '../../utils/resolve'
import { teamsSubscriptionCandidatesQuery, teamsSubscriptionEntitles, teamsSubscriptionRowsQuery } from '../candidates'
import { toMappedTeamMemberDto, toTeamMemberDto, toTeamRoleMappingDto } from './teams-dto'
import { loadTeamLadders, teamLadderKeyMap } from './teams-ladders'
import { chunkParams, inChunks } from '@frigear-nu/module-kit/server'

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

/** Owners per statement in `teamsCoveredBy`: each binds two parameters, so a chunk stays under D1's 100. */
const OWNERS_PER_QUERY = 40

/**
 * The teams any of `rules` can apply to (the rule's team, or every team of the rule's owner). The team ids and the
 * owners are read in chunks, so any number of rules stays under D1's bound-parameter limit.
 */
async function teamsCoveredBy(rules: readonly TeamRoleMappingDto[]): Promise<TeamsResolverTeam[]> {
  if (!rules.length) return []
  const columns = { id: schema.teams.id, ownerType: schema.teams.ownerType, ownerId: schema.teams.ownerId, kind: schema.teams.kind }
  const teamIds = [...new Set(rules.flatMap(rule => rule.teamId ? [rule.teamId] : []))]
  const owners = new Map<string, TeamOwner>()
  for (const rule of rules) if (!rule.teamId) owners.set(`${rule.ownerType}\u0000${rule.ownerId ?? ''}`, rule)
  const rows = [
    ...await inChunks(teamIds, chunk => db.select(columns).from(schema.teams).where(inArray(schema.teams.id, chunk))),
    ...await inChunks([...owners.values()], chunk => db.select(columns).from(schema.teams)
      .where(or(...chunk.map(owner => ownerCondition(schema.teams, owner)))), OWNERS_PER_QUERY),
  ]
  const byId = new Map(rows.map(row => [row.id, { ...row, ownerId: row.ownerId ?? null }]))
  return [...byId.values()].filter(team => rules.some(rule => mappingCoversTeam(rule, team)))
}

/** The global roles of a user (closed over `inherit`): auth's `getEffectiveRoles`, `[]` for an unknown user. */
export async function teamsGlobalRolesOf(event: H3Event | undefined, userId: string | number): Promise<string[]> {
  const user = await loadAuthUser(userId)
  return user ? getEffectiveRoles(event, user) : []
}

/**
 * Whether a membership row grants its role: `status` null or `'active'`. Any other status (crew's `pending`,
 * `inactive`, ...) keeps the row listed on the team but gives no grant: no read, no lead, no `team` grant, and no
 * mapped role on that team either (the row overrides mapping).
 */
export function teamMemberStatusGrants(status: string | null | undefined): boolean {
  return status === null || status === undefined || status === 'active'
}

/**
 * The explicit memberships of a user, on every owner: the rows that grant (`teamMemberStatusGrants`) as grants, and the
 * teams of the rows that do not (`blocked`). Any explicit row overrides mapping on its team, so a `pending` or
 * `inactive` member gets no mapped role there either.
 */
async function explicitGrantsOf(userId: number): Promise<{ grants: TeamRoleGrant[], blocked: string[] }> {
  const rows = await db.select({
    teamId: schema.teamMembers.teamId,
    role: schema.teamMembers.role,
    status: schema.teamMembers.status,
    ownerType: schema.teams.ownerType,
    ownerId: schema.teams.ownerId,
    kind: schema.teams.kind,
  }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(eq(schema.teamMembers.userId, userId))
  const grants: TeamRoleGrant[] = []
  const blocked: string[] = []
  for (const row of rows) {
    if (teamMemberStatusGrants(row.status)) grants.push({ ownerType: row.ownerType, ownerId: row.ownerId ?? null, teamId: row.teamId, kind: row.kind, role: row.role, source: 'explicit' })
    else blocked.push(row.teamId)
  }
  return { grants, blocked }
}

export type TeamsGrantOptions = {
  /** The user's global roles when the caller already has them (the OAuth claim). */
  globalRoles?: string[]
  /**
   * Throw when a `teams:roles:resolve` listener fails, instead of leaving its grants out. For callers that must not
   * pass on a list that looks complete but is not (the OAuth `teams` claim). Not cached.
   */
  strict?: boolean
}

/**
 * Every team role of a user on every owner: explicit memberships first, then one mapped grant per other team (role
 * rules from the global roles, plan rules and any other source through `teams:roles:resolve`). Explicit beats mapped
 * on the same team; between mapped rules the highest `priority` wins, then the higher role. Cached per request.
 */
export function resolveAllTeamRoles(event: H3Event | undefined, userId: string | number, options: TeamsGrantOptions = {}): Promise<TeamRoleGrant[]> {
  if (options.strict) return computeTeamGrants(event, Number(userId), options)
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
  const [{ grants: explicit, blocked }, rules, ladderRows] = await Promise.all([explicitGrantsOf(userId), loadTeamMappingRules(event), loadTeamLadders(event)])
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
    if (options.strict) throw error
    // Fail closed: a listener that throws gives nobody anything. Its grants (and those of listeners after it) are
    // dropped; the explicit memberships and teams' own role rules still count.
    console.error('[teams] a teams:roles:resolve listener failed; its mapped grants are left out', error)
    return mergeTeamGrants(explicit, own, ladders, blocked)
  }
  return mergeTeamGrants(explicit, ctx.grants, ladders, blocked)
}

/**
 * The team roles `userId` holds on the teams of `owner` (the team-role contract): explicit
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
  const users = new Map<number, UserFields>()
  // In chunks: D1 allows 100 bound parameters per query, and a team can have more members.
  for (const chunk of chunkParams([...new Set(ids)])) {
    const rows = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, avatar: schema.users.avatar })
      .from(schema.users).where(inArray(schema.users.id, chunk))
    for (const row of rows) users.set(Number(row.id), { name: row.name ?? null, email: row.email ?? null, avatar: row.avatar ?? null })
  }
  return users
}

type CandidateTables = {
  subscriptions?: Parameters<typeof teamsSubscriptionRowsQuery>[1]
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
 * The candidates teams knows itself: the holders of a role a rule names, inheritance included (auth's
 * `listRoleHolders`, through the role provider; nobody without `@frigear-nu/authorization`), and users with an entitled
 * subscription to a plan a rule names (`subscriptions`).
 */
async function builtInCandidates(event: H3Event, rules: readonly TeamRoleMappingDto[]): Promise<number[]> {
  const ids: number[] = []
  const roles = [...new Set(rules.flatMap(rule => isRoleMatch(rule.match) ? [rule.match.role] : []))]
  if (roles.length) ids.push(...await listRoleHolders(event, roles, { limit: TEAMS_MAPPED_CANDIDATE_LIMIT }))
  const tables = schema as unknown as CandidateTables
  const plans = [...new Set(rules.flatMap(rule => isPlanMatch(rule.match) ? [rule.match.plan] : []))]
  if (plans.length && tables.subscriptions) {
    ids.push(...await candidateSource('subscriptions', async () => teamsSubscriptionCandidatesQuery(db, tables.subscriptions!, plans, TEAMS_MAPPED_CANDIDATE_LIMIT)))
  }
  return ids
}

/** The plans each of `userIds` holds an entitled subscription to, among `plans`: one statement per chunk of users. */
async function entitledPlansOf(table: NonNullable<CandidateTables['subscriptions']>, userIds: readonly number[], plans: readonly string[]): Promise<Map<number, Set<string>>> {
  const held = new Map<number, Set<string>>()
  // The statement binds the plans and two statuses next to the ids.
  const rows = await inChunks(userIds, chunk => teamsSubscriptionRowsQuery(db, table, chunk, plans) as unknown as Promise<Array<{ userId: unknown, planKey: unknown, source?: unknown, currentPeriodEnd?: unknown }>>, Math.max(1, 90 - plans.length - 2))
  for (const row of rows) {
    if (typeof row.planKey !== 'string' || !teamsSubscriptionEntitles(row)) continue
    const userId = Number(row.userId)
    const set = held.get(userId) ?? new Set<string>()
    set.add(row.planKey)
    held.set(userId, set)
  }
  return held
}

/**
 * The mapped role each of `candidates` holds on `team` (none of them has an explicit row there), resolved in bulk: a
 * small, fixed number of statements however many candidates there are (each chunked for D1). The users and their
 * assigned roles are loaded at once (`loadAuthUsers`, `primeAssignedRoles`), role rules are checked in memory, `plan`
 * rules with one subscriptions query when `@frigear-nu/subscriptions` is installed; any other rule (or a `plan` rule
 * without subscriptions) goes to the `teams:roles:resolve` listeners, once per candidate, for this one team. It agrees
 * with `teamGrantOf` for these users.
 */
async function mappedRolesOn(event: H3Event, team: TeamsResolverTeam, rules: readonly TeamRoleMappingDto[], candidates: readonly number[]): Promise<Map<number, string>> {
  const roles = new Map<number, string>()
  if (!candidates.length || !rules.length) return roles
  const ladders = teamLadderKeyMap(await loadTeamLadders(event))
  const users = await loadAuthUsers(candidates)
  await primeAssignedRoles(event, [...users.keys()])

  const subscriptions = (schema as unknown as CandidateTables).subscriptions
  const roleRules = rules.filter(rule => isRoleMatch(rule.match))
  const planRules = subscriptions ? rules.filter(rule => isPlanMatch(rule.match)) : []
  const listenerRules = rules.filter(rule => !isRoleMatch(rule.match) && !planRules.includes(rule))
  const plans = [...new Set(planRules.map(rule => (rule.match as { plan: string }).plan))]
  let held = new Map<number, Set<string>>()
  if (plans.length && subscriptions) {
    try {
      held = await entitledPlansOf(subscriptions, [...users.keys()], plans)
    }
    catch (error) {
      // Fail closed, as the per-user listener does: a plan that cannot be checked is not held.
      console.error('[teams] the subscriptions of mapped candidates could not be checked; their plan rules give no role', error)
    }
  }

  for (const userId of candidates) {
    const user = users.get(userId)
    if (!user) continue
    const globalRoles = await getEffectiveRoles(event, user)
    const has = new Set(globalRoles)
    const met = [
      ...roleRules.filter(rule => has.has((rule.match as { role: string }).role)),
      ...planRules.filter(rule => held.get(userId)?.has((rule.match as { plan: string }).plan)),
    ]
    const own = mappedGrantsFor([team], met, ladders)
    let grants = own
    if (listenerRules.length) {
      const ctx: TeamsRolesResolveContext = {
        event,
        user: { id: userId },
        owner: { ownerType: team.ownerType, ownerId: team.ownerId },
        globalRoles: [...globalRoles],
        rules: [...listenerRules],
        teams: [team],
        ladders,
        grants: [...own],
      }
      try {
        await useNitroApp().hooks.callHook('teams:roles:resolve', ctx)
        grants = ctx.grants.filter(grant => grant.teamId === team.id)
      }
      catch (error) {
        console.error('[teams] a teams:roles:resolve listener failed; its mapped grants are left out', error)
      }
    }
    const [grant] = mergeTeamGrants([], grants, ladders)
    if (grant) roles.set(userId, grant.role)
  }
  return roles
}

export type TeamMembersOptions = {
  /** Also list the mapped members (on demand: every candidate is resolved). */
  mapped?: boolean
  /** Copy the members' emails into the DTOs (the caller holds `teams:pii`). */
  pii?: boolean
  /**
   * `false` is the view of a caller who neither manages nor leads the team: only the rows that grant their role
   * (`teamMemberStatusGrants`) are listed, so pending applicants and inactive members stay hidden, and the `status` is
   * left out of the DTOs. By default every row is listed, with its status.
   */
  status?: boolean
}

/**
 * The members of a team: the explicit rows (by role, then name), and with `mapped: true` the users who hold a mapped
 * role on it. Mapped candidates come from the role holders (auth's `listRoleHolders`), the subscribers of mapped plans and
 * `teams:members:candidates` listeners; a role granted only through `defaultRoles`, an `auto` role or the
 * `authorization:roles` hook cannot be enumerated and is not listed. At most {@link TEAMS_MAPPED_CANDIDATE_LIMIT}
 * candidates are checked, in bulk: the number of statements does not grow with the candidates (beyond D1 chunking).
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
      const ctx: TeamsMembersCandidatesContext = { event, team: resolverTeam, rules, userIds: new Set(await builtInCandidates(event, rules)) }
      try {
        await useNitroApp().hooks.callHook('teams:members:candidates', ctx)
      }
      catch (error) {
        console.error('[teams] a teams:members:candidates listener failed; the candidates found so far are checked', error)
      }
      const candidates = [...ctx.userIds].filter(id => Number.isInteger(id) && id > 0 && !explicitIds.has(id)).slice(0, TEAMS_MAPPED_CANDIDATE_LIMIT)
      for (const [userId, role] of await mappedRolesOn(event, resolverTeam, rules, candidates)) mapped.push({ userId, role })
    }
  }

  const users = await usersById([...explicitIds, ...mapped.map(item => item.userId)])
  const keys = (await loadTeamLadders(event))[team.kind]?.roles.map(role => role.key) ?? []
  const listed = options.status === false ? rows.filter(row => teamMemberStatusGrants(row.status)) : rows
  const all = [
    ...listed.map(row => toTeamMemberDto(row, users.get(row.userId), pii)),
    ...mapped.map(item => toMappedTeamMemberDto(teamId, item.userId, item.role, users.get(item.userId), pii)),
  ]
  const members = options.status === false ? all.map(({ status: _status, ...member }) => member as TeamMemberDto) : all
  // Highest role first, then by name: leads at the top.
  return members.sort((a, b) => keys.indexOf(b.role) - keys.indexOf(a.role) || (a.name ?? '').localeCompare(b.name ?? '') || a.userId - b.userId)
}
