import type { H3Event } from 'h3'
import type { OwnerType, TeamRoleGrant } from '@frigear-nu/audience'
import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated, OwnerType, TeamRoleGrant }

/** One role of a ladder: a lower-case `key` (stored on members and mapping rules) and its label. */
export type TeamLadderRole = {
  key: string
  label: Translated
}

/** The roles of a team kind, lowest first, and the lowest role that leads the team (`teams:lead`). */
export type TeamLadder = {
  roles: TeamLadderRole[]
  /** The lowest role that counts as a lead of the team. Unset: nobody leads a team of this kind. */
  leadFrom?: string | null
}

/** What a mapping rule matches: a global role (with inheritance), or an active subscription to a plan. */
export type TeamRoleMatch = { role: string } | { plan: string }

export type ModuleOptions = {
  /**
   * The built-in ladders, by team kind. They are stored in `team_role_ladders` on the first request when the kind has
   * no row yet, and admins may edit the row later. Merged over the default `bar` ladder
   * (`volunteer`, `bartender`, `ba`, `coordinator`; `ba` and up lead).
   */
  ladders?: Record<string, TeamLadder>
  settings?: {
    pages?: {
      /** Staff team list (needs `teams:manage`). `true` = `/admin/teams`. Off by default. */
      admin?: string | boolean
      /** Staff team page (members, mapping rules, ladder); must contain an `:id` param. `true` = `/admin/teams/:id`. Off by default. */
      adminTeam?: string | boolean
    }
    /**
     * Add a "Teams" tab to the `admin.operations` tab area (when `@frigear-nu/widget` is installed). Defaults to `true`;
     * harmless when nothing renders the area.
     */
    operationsTab?: boolean
  }
}

export type PublicModuleOptions = {
  pages: { admin?: string, adminTeam?: string }
}

/** Where a team (or a mapping rule) belongs: `ownerId` is `null` for the platform. */
export type TeamOwner = {
  ownerType: OwnerType
  ownerId: string | null
}

/** A team as anybody who may read it sees it (`GET /api/teams/:id`). */
export type TeamDto = TeamOwner & {
  id: string
  parentId: string | null
  kind: string
  name: Translated
  description: Translated | null
  capacity: number | null
  sort: number
}

/** The staff view (`/api/admin/teams`): the same fields plus the audit dates, the owner's label and the member count. */
export type AdminTeamDto = TeamDto & {
  /** The owner's label from `audience:owner:resolve`, `null` for the platform or an owner nobody answers for. */
  ownerLabel: Translated | null
  /** Explicit members only: mapped members are resolved on demand. */
  memberCount: number
  createdAt: string
  updatedAt: string
}

/** One member of a team: an explicit membership (a row) or a mapped one (resolved from a rule, never stored). */
export type TeamMemberDto = {
  /** The membership row's id (`tmm_...`); `null` for a mapped member. */
  id: string | null
  teamId: string
  userId: number
  name: string | null
  avatar: string | null
  /** Only with `teams:pii`; otherwise left out. */
  email?: string | null
  role: string
  /** Owned by consumers such as crew; teams never interprets it. Always `null` for a mapped member. */
  status: string | null
  source: 'explicit' | 'mapped'
  /** When the membership was added; `null` for a mapped member. */
  addedAt: string | null
}

/** My team roles (`GET /api/teams/me`): the grant plus the team's name. */
export type MyTeamDto = TeamRoleGrant & {
  name: Translated
}

/** A role mapping rule (`/api/admin/teams/mappings`). */
export type TeamRoleMappingDto = TeamOwner & {
  id: string
  /** `null`: every team of the owner. */
  teamId: string | null
  match: TeamRoleMatch
  teamRole: string
  priority: number
  createdAt: string
  updatedAt: string
}

/** A ladder as the API answers it (`/api/admin/teams/ladders/:kind`). */
export type TeamLadderDto = TeamLadder & {
  kind: string
  leadFrom: string | null
  /** `stored`: a row of `team_role_ladders`. `default`: the module option, not stored yet. */
  source: 'stored' | 'default'
}

/** A user found by the staff lookup (`GET /api/admin/teams/users?q=`). `email` only with `teams:pii`. */
export type TeamUserLookupDto = {
  id: number
  name: string | null
  avatar: string | null
  email?: string | null
}

/** The `teams` claim of an id_token / userinfo with the `teams:read` scope: one entry per grant. */
export type TeamsClaimEntry = {
  id: string
  ownerType: OwnerType
  ownerId: string | null
  kind: string
  role: string
  source: 'explicit' | 'mapped'
}

/** A mapped grant while resolving: `priority` of the rule that produced it (default 0) decides between rules. */
export type TeamsMappedGrant = TeamRoleGrant & { priority?: number }

/** A team as the resolver sees it. */
export type TeamsResolverTeam = TeamOwner & { id: string, kind: string }

/** Context of `teams:member:added` and `teams:member:removed`. */
export type TeamMemberContext = {
  event: H3Event
  team: AdminTeamDto
  member: TeamMemberDto
}

/** Context of `teams:member:role-changed`. */
export type TeamMemberRoleChangedContext = TeamMemberContext & {
  from: string
  to: string
}

/**
 * Context of `teams:roles:resolve`. Listeners push mapped grants into `grants` (give them the `priority` of the rule
 * they stand for; explicit memberships always win). `owner` is `null` when every owner is resolved at once (the
 * viewer, the claim). `event` is `undefined` outside a request (the OAuth claim).
 */
export type TeamsRolesResolveContext = {
  event: H3Event | undefined
  user: { id: string | number }
  owner: TeamOwner | null
  /** The user's global roles (closed over `inherit`). */
  globalRoles: string[]
  /** The mapping rules in play, every kind of `match`: listeners pick the ones they answer (teams answers `plan`). */
  rules: TeamRoleMappingDto[]
  /** The teams those rules can apply to. */
  teams: TeamsResolverTeam[]
  /** Kind to ordered role keys, lowest first. */
  ladders: Record<string, string[]>
  grants: TeamsMappedGrant[]
}

/**
 * Context of `teams:members:candidates`: listeners add the ids of users who may hold a mapped role on `team`, so
 * `GET /api/teams/:id/members?include=mapped` can list them. Teams adds the users with an assigned role in
 * `@frigear-nu/authorization` and the subscribers of mapped plans itself. Each candidate is checked with the resolver.
 */
export type TeamsMembersCandidatesContext = {
  event: H3Event
  team: TeamsResolverTeam
  rules: TeamRoleMappingDto[]
  userIds: Set<number>
}
