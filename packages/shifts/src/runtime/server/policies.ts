import { takesPart } from '@frigear-nu/audience'

/**
 * What the shifts policies receive. An assignment is `{ userId, teamId }`; a shift of a published schedule adds
 * `published: true`; a team is `{ teamId }`; an operation (who is on shift now) is `{ operationId }`.
 */
type ShiftsRecord = { userId?: number, teamId?: string, operationId?: string, published?: boolean }

// The record rules of shifts (registered with `addPolicies` in `module.ts`). A policy only narrows: signed-in users hold
// `shifts:read`, `shifts:swap` and `shifts:lead` implicitly, these decide which records that covers. `allows(event,
// 'shifts:manage')` is asked without a record, so it does not run these policies again.
export default [
  // Your own assignments; the published shifts of a team you hold an explicit role on; everything on a team you lead;
  // who is on shift now in an operation you take part in (approved crew, or an explicit team role there); staff.
  definePolicy<ShiftsRecord>('shifts:read', async ({ event, user, record }) => {
    if (!record) return undefined
    if (await allows(event, 'shifts:manage')) return true
    if (record.userId !== undefined && Number(user.id) === record.userId) return true
    if (record.teamId) {
      if (await isTeamLead(event, user.id, record.teamId)) return true
      if (record.published && (await teamGrantOf(event, user.id, record.teamId))?.source === 'explicit') return true
      return false
    }
    if (record.operationId) return takesPart(await resolveOperationsViewer(event, user), record.operationId)
    return false
  }),
  // Only your own assignments.
  definePolicy<ShiftsRecord>('shifts:swap', ({ user, record }) => {
    if (!record) return undefined
    return record.userId !== undefined && Number(user.id) === record.userId
  }),
  // The leads of the record's team (`isTeamLead` of teams: lead role and up), and staff.
  definePolicy<ShiftsRecord>('shifts:lead', async ({ event, user, record }) => {
    if (!record) return undefined
    if (await allows(event, 'shifts:manage')) return true
    return !!record.teamId && isTeamLead(event, user.id, record.teamId)
  }),
]
