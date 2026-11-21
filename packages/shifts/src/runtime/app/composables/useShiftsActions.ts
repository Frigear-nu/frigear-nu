import type { DropdownMenuItem } from '@nuxt/ui'
import ShiftBroadcastSlideover from '../components/ShiftBroadcastSlideover.vue'
import ShiftBulkSlideover from '../components/ShiftBulkSlideover.vue'
import ShiftCopySlideover from '../components/ShiftCopySlideover.vue'
import ShiftFeedSlideover from '../components/ShiftFeedSlideover.vue'
import ShiftPerkSlideover from '../components/ShiftPerkSlideover.vue'
import ShiftRoleSlideover from '../components/ShiftRoleSlideover.vue'
import ShiftScheduleSlideover from '../components/ShiftScheduleSlideover.vue'
import ShiftSlideover from '../components/ShiftSlideover.vue'
import type { ShiftsLadder, ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import type { ShiftBroadcastResultDto, ShiftCopyResultDto, ShiftDto, ShiftPerkDto, ShiftRoleDto, ShiftScheduleDto, ShiftSwapDto, ShiftWithAssigneesDto } from '../../../types'
import { $fetch, useAction, useConfirmDialog, useModuleT, useOverlay, useShiftsTranslate } from '#imports'

/** What the schedule forms need to know about the operation. */
export type ShiftsScheduleContext = { teams: ShiftsTeamOption[], ladders: ShiftsLadder[], roles: ShiftRoleDto[] }

/**
 * What staff do with schedules, roles, shifts and swaps, shared by the Shifts tab: the forms (opened as slideovers,
 * resolving with the saved record or `false`), the confirmations of publishing and deleting, and the row menus.
 */
export function useShiftsActions() {
  const t = useModuleT('shifts')
  const tr = useShiftsTranslate()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()

  const createSchedule = async (operationId: string) =>
    await overlay.create(ShiftScheduleSlideover, { destroyOnClose: true, props: { operationId } }).open() as ShiftScheduleDto | false
  const editSchedule = async (schedule: ShiftScheduleDto) =>
    await overlay.create(ShiftScheduleSlideover, { destroyOnClose: true, props: { operationId: schedule.operationId, schedule } }).open() as ShiftScheduleDto | false

  async function publishSchedule(schedule: ShiftScheduleDto): Promise<ShiftScheduleDto | false> {
    const name = tr(schedule.name)
    const confirmed = await confirm({
      title: t('admin.publishTitle', 'Publish {name}?', { name }),
      description: t('admin.publishDescription', 'Volunteers see their shifts in it and can swap them. A published schedule cannot go back to draft.'),
      confirmText: t('admin.publishAction', 'Publish schedule'),
    })
    if (!confirmed) return false
    return await run(
      () => $fetch<ShiftScheduleDto>(shiftsApi.admin.publish(schedule.id), { method: 'POST' }),
      { success: t('admin.published', 'Published {name}', { name }), error: t('admin.publishFailed', 'Could not publish the schedule') },
    ) ?? false
  }

  async function deleteSchedule(schedule: ShiftScheduleDto): Promise<boolean> {
    const name = tr(schedule.name)
    const confirmed = await confirm({
      title: t('admin.deleteScheduleTitle', 'Delete {name}?', { name }),
      description: t('admin.deleteScheduleDescription', 'Its shift roles and shifts are deleted too. A schedule with people on its shifts cannot be deleted.'),
      confirmText: t('admin.deleteSchedule', 'Delete schedule'),
      destructive: true,
    })
    if (!confirmed) return false
    return await run(
      () => $fetch(shiftsApi.admin.schedule(schedule.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.scheduleDeleted', 'Deleted {name}', { name }), error: t('admin.deleteScheduleFailed', 'Could not delete the schedule') },
    ) === true
  }

  const bulkCreate = async (schedule: ShiftScheduleDto, context: ShiftsScheduleContext) =>
    await overlay.create(ShiftBulkSlideover, { destroyOnClose: true, props: { scheduleId: schedule.id, teams: context.teams, roles: context.roles } }).open() as ShiftDto[] | false
  const copyFrom = async (schedule: ShiftScheduleDto) =>
    await overlay.create(ShiftCopySlideover, { destroyOnClose: true, props: { schedule } }).open() as ShiftCopyResultDto | false
  const createRole = async (schedule: ShiftScheduleDto, context: ShiftsScheduleContext) =>
    await overlay.create(ShiftRoleSlideover, { destroyOnClose: true, props: { scheduleId: schedule.id, teams: context.teams, ladders: context.ladders } }).open() as ShiftRoleDto | false
  const editRole = async (role: ShiftRoleDto, context: ShiftsScheduleContext) =>
    await overlay.create(ShiftRoleSlideover, { destroyOnClose: true, props: { scheduleId: role.scheduleId, teams: context.teams, ladders: context.ladders, role } }).open() as ShiftRoleDto | false

  async function deleteRole(role: ShiftRoleDto): Promise<boolean> {
    const name = tr(role.name)
    const confirmed = await confirm({
      title: t('admin.deleteRoleTitle', 'Delete the role {name}?', { name }),
      description: t('admin.deleteRoleDescription', 'A role that shifts or assignments use cannot be deleted.'),
      confirmText: t('admin.deleteRole', 'Delete shift role'),
      destructive: true,
    })
    if (!confirmed) return false
    return await run(
      () => $fetch(shiftsApi.admin.role(role.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.roleDeleted', 'Deleted {name}', { name }), error: t('admin.deleteRoleFailed', 'Could not delete the shift role') },
    ) === true
  }

  /** Opens a shift. Resolves with `true` when something changed. */
  const openShift = async (shift: ShiftWithAssigneesDto, context: { roles: ShiftRoleDto[], minPerShift?: number | null }) =>
    await overlay.create(ShiftSlideover, { destroyOnClose: true, props: { shift, roles: context.roles, minPerShift: context.minPerShift ?? null } }).open() as boolean

  async function deleteShift(shift: ShiftWithAssigneesDto): Promise<boolean> {
    const confirmed = await confirm({
      title: t('admin.deleteShiftTitle', 'Delete this shift?'),
      description: t('admin.deleteShiftDescription', 'A shift with people on it cannot be deleted: take them off first.'),
      confirmText: t('admin.deleteShift', 'Delete shift'),
      destructive: true,
    })
    if (!confirmed) return false
    return await run(
      () => $fetch(shiftsApi.admin.shift(shift.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.shiftDeleted', 'Deleted the shift'), error: t('admin.deleteShiftFailed', 'Could not delete the shift') },
    ) === true
  }

  async function approveSwap(swap: ShiftSwapDto): Promise<boolean> {
    return await run(
      () => $fetch(shiftsApi.approveSwap(swap.id), { method: 'POST' }).then(() => true),
      { success: t('swaps.approved', 'Approved the swap of {name}', { name: swap.owner.name ?? '' }), error: t('swaps.approveFailed', 'Could not approve the swap') },
    ) === true
  }

  async function rejectSwap(swap: ShiftSwapDto): Promise<boolean> {
    const confirmed = await confirm({
      title: t('swaps.rejectTitle', 'Reject this swap?'),
      description: t('swaps.rejectDescription', 'Both people keep their shifts, and the shift is open for other offers again.'),
      confirmText: t('swaps.rejectAction', 'Reject swap'),
      destructive: true,
    })
    if (!confirmed) return false
    return await run(
      () => $fetch(shiftsApi.rejectSwap(swap.id), { method: 'POST' }).then(() => true),
      { success: t('swaps.rejected', 'Rejected the swap'), error: t('swaps.rejectFailed', 'Could not reject the swap') },
    ) === true
  }

  /** Opens "Subscribe in calendar": my secret iCal link, made or revoked there. */
  const subscribe = async () => {
    await overlay.create(ShiftFeedSlideover, { destroyOnClose: true }).open()
  }

  /** Staff: message the teams of an operation (resolves with the result, or `false`). */
  const broadcast = async (operationId: string, context: Pick<ShiftsScheduleContext, 'teams' | 'ladders'>) =>
    await overlay.create(ShiftBroadcastSlideover, { destroyOnClose: true, props: { operationId, teams: context.teams, ladders: context.ladders } }).open() as ShiftBroadcastResultDto | false

  /** A lead: message their own team. */
  const broadcastToTeam = async (teamId: string, teamName: string) =>
    await overlay.create(ShiftBroadcastSlideover, { destroyOnClose: true, props: { teamId, teamName } }).open() as ShiftBroadcastResultDto | false

  const createPerk = async (operationId: string, teams: ShiftsScheduleContext['teams']) =>
    await overlay.create(ShiftPerkSlideover, { destroyOnClose: true, props: { operationId, teams } }).open() as ShiftPerkDto | false
  const editPerk = async (perk: ShiftPerkDto, teams: ShiftsScheduleContext['teams']) =>
    await overlay.create(ShiftPerkSlideover, { destroyOnClose: true, props: { operationId: perk.operationId, teams, perk } }).open() as ShiftPerkDto | false

  async function deletePerk(perk: ShiftPerkDto): Promise<boolean> {
    const name = tr(perk.name)
    const confirmed = await confirm({
      title: t('perks.deleteTitle', 'Delete {name}?', { name }),
      description: t('perks.deleteDescription', 'Volunteers lose it from their pass, and the record of who got it is deleted too.'),
      confirmText: t('perks.delete', 'Delete perk'),
      destructive: true,
    })
    if (!confirmed) return false
    return await run(
      () => $fetch(shiftsApi.admin.perk(perk.id), { method: 'DELETE' }).then(() => true),
      { success: t('perks.deleted', 'Deleted {name}', { name }), error: t('perks.deleteFailed', 'Could not delete the perk') },
    ) === true
  }

  /** The row menu of a perk: Edit | Delete. */
  function perkMenu(perk: ShiftPerkDto, context: { teams: ShiftsScheduleContext['teams'], changed: () => unknown }): DropdownMenuItem[][] {
    return [
      [{ label: t('perks.editTitle', 'Edit perk'), icon: 'i-lucide-pencil', onSelect: async () => (await editPerk(perk, context.teams)) && context.changed() }],
      [{ label: t('perks.delete', 'Delete perk'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: async () => (await deletePerk(perk)) && context.changed() }],
    ]
  }

  /** The row menu of a schedule: Open | Edit, Copy from, Publish | Delete. */
  function scheduleMenu(schedule: ShiftScheduleDto, handlers: { open: () => unknown, changed: () => unknown }): DropdownMenuItem[][] {
    const after = async (result: unknown) => {
      if (result) await handlers.changed()
    }
    return [
      [{ label: t('admin.openSchedule', 'Open schedule'), icon: 'i-lucide-arrow-right', onSelect: () => handlers.open() }],
      [
        { label: t('admin.editSchedule', 'Edit schedule'), icon: 'i-lucide-pencil', onSelect: async () => after(await editSchedule(schedule)) },
        { label: t('admin.copyTitle', 'Copy from another schedule'), icon: 'i-lucide-copy', onSelect: async () => after(await copyFrom(schedule)) },
        ...(schedule.status === 'draft' ? [{ label: t('admin.publishAction', 'Publish schedule'), icon: 'i-lucide-send', onSelect: async () => after(await publishSchedule(schedule)) }] : []),
      ],
      [{ label: t('admin.deleteSchedule', 'Delete schedule'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: async () => after(await deleteSchedule(schedule)) }],
    ]
  }

  /** The row menu of a shift role: Edit | Delete. */
  function roleMenu(role: ShiftRoleDto, context: ShiftsScheduleContext & { changed: () => unknown }): DropdownMenuItem[][] {
    return [
      [{ label: t('admin.editRole', 'Edit shift role'), icon: 'i-lucide-pencil', onSelect: async () => (await editRole(role, context)) && context.changed() }],
      [{ label: t('admin.deleteRole', 'Delete shift role'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: async () => (await deleteRole(role)) && context.changed() }],
    ]
  }

  return {
    createSchedule,
    editSchedule,
    publishSchedule,
    deleteSchedule,
    bulkCreate,
    copyFrom,
    createRole,
    editRole,
    deleteRole,
    openShift,
    deleteShift,
    approveSwap,
    rejectSwap,
    scheduleMenu,
    roleMenu,
    subscribe,
    broadcast,
    broadcastToTeam,
    createPerk,
    editPerk,
    deletePerk,
    perkMenu,
  }
}
