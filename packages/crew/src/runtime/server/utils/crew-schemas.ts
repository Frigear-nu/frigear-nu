import { z } from 'zod'
import { pageQuery } from '@frigear-nu/module-kit/server'
import { CREW_STATUSES } from '../../utils/status'

const key = z.string().trim().min(1).max(64)

// One text for every language, or a locale -> text map. Empty entries are dropped.
const crewTranslated = z.union([
  z.string().trim().min(1).max(2000),
  z.record(z.string(), z.string().max(2000))
    .transform(value => Object.fromEntries(Object.entries(value).filter(([, text]) => text.trim())))
    .refine(value => Object.keys(value).length > 0, 'Add a text in at least one language.'),
])

const statusEmail = z.object({
  enabled: z.boolean().optional(),
  subject: crewTranslated.optional(),
  body: crewTranslated.optional(),
})

const date = z.iso.datetime({ offset: true }).transform(value => new Date(value))

/** The body of `PUT /api/admin/crew/operations/:operationId/settings`: the whole record, so a field left out is reset. */
export const crewSettingsInput = z.object({
  formId: key.nullish(),
  defaultTeamId: key.nullish(),
  capacity: z.number().int().min(0).max(100_000).nullish(),
  waitlist: z.boolean().default(true),
  previousCrewFirst: z.boolean().default(false),
  opensAt: date.nullish(),
  closesAt: date.nullish(),
  statusEmails: z.strictObject({
    applied: statusEmail.optional(),
    waitlisted: statusEmail.optional(),
    approved: statusEmail.optional(),
    rejected: statusEmail.optional(),
    withdrawn: statusEmail.optional(),
  }).nullish(),
  presets: z.boolean().default(true),
}).refine(value => !value.opensAt || !value.closesAt || value.closesAt > value.opensAt, {
  message: 'Applications must close after they open.',
  path: ['closesAt'],
})

/** The body of `POST /api/admin/crew/members/:id/approve`: a team and role to approve into (both optional). */
export const crewApproveInput = z.object({
  teamId: key.optional(),
  role: key.optional(),
}).prefault({})

/** The body of `PATCH /api/admin/crew/members/:id`. */
export const crewMemberPatchSchema = z.object({
  teamId: key.optional(),
  role: key.optional(),
}).refine(value => value.teamId !== undefined || value.role !== undefined, 'Change the team or the role.')

/** The body of `POST /api/admin/crew/operations/:operationId/members`: who to add, and optionally the team and role. */
export const crewAddMemberInput = z.object({
  userId: z.number().int().positive(),
  teamId: key.optional(),
  role: key.optional(),
  /** The inbox thread the person was added from: the addition goes on its audit trail (`inbox:thread:linked`). */
  inboxThreadId: key.optional(),
})

/** The query of `GET /api/admin/crew/users`: the user search of the "Add crew member" picker. */
export const crewUserLookupQuery = z.object({ q: z.string().trim().min(1).max(200) })

/** The body of `POST /api/admin/crew/operations/:operationId/members/approve`. */
export const crewBulkApproveInput = z.object({
  ids: z.array(key).min(1).max(200),
})

/** The body of `POST /api/admin/crew/operations/:operationId/invites`. */
export const crewInviteInput = z.object({
  teamId: key,
  role: key,
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresAt: date.nullish(),
})

/** The query of the members list. */
export const crewMembersQuery = pageQuery({
  sort: ['appliedAt', 'name', 'crewStatus', 'role', 'previousCrew', 'waitlistPosition'],
  defaultSort: 'appliedAt',
  defaultOrder: 'desc',
  filters: {
    status: z.enum(CREW_STATUSES).optional(),
    team: z.string().trim().min(1).max(64).optional(),
    previous: z.enum(['true', 'false']).optional(),
  },
})
