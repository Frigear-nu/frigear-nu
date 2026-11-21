import { z } from 'zod'
import { pageQuery } from '@frigear-nu/module-kit/server'
import { TEAM_KEY_PATTERN, teamLadderIssues } from '../../utils/ladders'

// One text for every language, or a locale -> text map. Empty entries are dropped and a map needs at least one text.
export const teamsTranslated = z.union([
  z.string().trim().min(1).max(500),
  z.record(z.string(), z.string().max(500))
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

/** A role key, a team kind or an owner type: lower case, as stored. */
export const teamsKey = z.string().trim().min(1).max(64).regex(TEAM_KEY_PATTERN, 'Use lower case letters, digits, - and _.')

const ownerFields = {
  ownerType: teamsKey,
  /** `null` (or left out) for the platform; required for any other owner type. */
  ownerId: z.string().trim().min(1).max(128).nullish(),
}

/** The body of `POST /api/admin/teams`. The owner and kind are fixed once created. */
export const teamInput = z.object({
  ...ownerFields,
  kind: teamsKey,
  name: teamsTranslated,
  description: teamsTranslated.nullish(),
  parentId: z.string().trim().min(1).max(64).nullish(),
  capacity: z.number().int().min(0).max(100_000).nullish(),
  sort: z.number().int().min(-100_000).max(100_000).optional(),
})

/** The body of `PATCH /api/admin/teams/:id`: the texts, parent, capacity and sort. */
export const teamPatchSchema = teamInput.pick({ name: true, description: true, parentId: true, capacity: true, sort: true }).partial()

/** The body of `POST /api/admin/teams/:id/members`. */
export const teamMemberInput = z.object({
  userId: z.number().int().positive(),
  role: teamsKey,
  status: z.string().trim().min(1).max(64).nullish(),
})

/** The body of `PATCH /api/admin/teams/:id/members/:userId`. */
export const teamMemberPatchSchema = teamMemberInput.pick({ role: true, status: true }).partial()

/** What a rule matches: exactly one of `role` (a global role) or `plan` (a subscription plan key). Unknown keys fail. */
export const teamRoleMatchSchema = z.union([
  z.strictObject({ role: z.string().trim().min(1).max(64) }),
  z.strictObject({ plan: z.string().trim().min(1).max(128) }),
])

/** The body of `POST /api/admin/teams/mappings`. */
export const teamMappingInput = z.object({
  ...ownerFields,
  teamId: z.string().trim().min(1).max(64).nullish(),
  match: teamRoleMatchSchema,
  teamRole: teamsKey,
  priority: z.number().int().min(-1000).max(1000).optional(),
})

/** The body of `PATCH /api/admin/teams/mappings/:id`: the owner is fixed; the rest may change. */
export const teamMappingPatchSchema = teamMappingInput.pick({ teamId: true, match: true, teamRole: true, priority: true }).partial()

/** The query of `GET /api/admin/teams/mappings`. */
export const teamMappingQuery = z.object({
  ownerType: teamsKey.optional(),
  ownerId: z.string().trim().min(1).max(128).optional(),
  teamId: z.string().trim().min(1).max(64).optional(),
})

/** The body of `PUT /api/admin/teams/ladders/:kind`: every role, lowest first, and the lowest lead role. */
export const teamLadderInput = z.object({
  roles: z.array(z.object({ key: teamsKey, label: teamsTranslated })).min(1).max(30),
  leadFrom: teamsKey.nullish(),
}).superRefine((value, ctx) => {
  for (const message of teamLadderIssues(value)) ctx.addIssue({ code: 'custom', message, path: ['roles'] })
})

/** The router params of the ladder routes. */
export const teamLadderParams = z.object({ kind: teamsKey })

/** The router params of the member routes. */
export const teamMemberParams = z.object({
  id: z.string().trim().min(1),
  userId: z.coerce.number().int().positive(),
})

/** The query of `GET /api/teams/:id/members`. */
export const teamMembersQuery = z.object({ include: z.enum(['mapped']).optional() })

/** The query of the staff user lookup. */
export const teamUserLookupQuery = z.object({ q: z.string().trim().min(1).max(200) })

/** The query of `GET /api/admin/teams`. */
export const teamListQuery = pageQuery({
  sort: ['sort', 'createdAt', 'kind'],
  defaultSort: 'sort',
  defaultOrder: 'asc',
  filters: {
    ownerType: teamsKey.optional(),
    ownerId: z.string().trim().min(1).max(128).optional(),
    kind: teamsKey.optional(),
  },
})
