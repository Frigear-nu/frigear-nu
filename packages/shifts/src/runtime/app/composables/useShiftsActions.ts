import type { DropdownMenuItem } from '@nuxt/ui'
import ShiftBroadcastSlideover from '../components/ShiftBroadcastSlideover.vue'
import ShiftBulkSlideover from '../components/ShiftBulkSlideover.vue'
import ShiftCopySlideover from '../components/ShiftCopySlideover.vue'
import ShiftFeedSlideover from '../components/ShiftFeedSlideover.vue'
import ShiftPerkSlideover from '../components/ShiftPerkSlideover.vue'
import ShiftRoleSlideover from '../components/ShiftRoleSlideover.vue'
import ShiftScheduleSlideover from '../components/ShiftScheduleSlideover.vue'
import ShiftSlideover from '../components/ShiftSlideover.vue'
import ShiftStationSlideover from '../components/ShiftStationSlideover.vue'
import type { ShiftsLadder, ShiftsTeamOption } from '../utils/admin-shifts'
import { shiftsApi } from '../../utils/api'
import { allowsSwapKind, offerKind } from '../../utils/settings'
import type { ShiftBroadcastResultDto, ShiftCopyResultDto, ShiftDto, ShiftPerkDto, ShiftRoleDto, ShiftScheduleDto, ShiftScheduleSettings, ShiftStationDto, ShiftSwapDto, ShiftWithAssigneesDto } from '../../../types'
import { $fetch, navigateTo, useAction, useConfirmDialog, useModuleT, useOverlay, useShiftsFormat, useShiftsLinks, useShiftsTranslate } from '#imports'

/** What the schedule forms need to know about the operation. */
export type ShiftsScheduleContext = { teams: ShiftsTeamOption[], ladders: ShiftsLadder[], roles: ShiftRoleDto[] }

/**
 * What staff do with schedules, roles, shifts and swaps, shared by the Shifts tab: the forms (opened as slideovers,
 * resolving with the saved record or `false`), saving a schedule's settings, the confirmations of publishing and
 * deleting, the row menus, and the short label of a schedule's settings.
 */
export function useShiftsActions() {
  const t = useModuleT('shifts')
  const tr = useShiftsTranslate()
  const format = useShiftsFormat()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const links = useShiftsLinks()

  const createSchedule = async (operationId: string) =>
    await overlay.create(ShiftScheduleSlideover, { destroyOnClose: true, props: { operationId } }).open() as ShiftScheduleDto | false
  const editSchedule = async (schedule: ShiftScheduleDto) =>
    await overlay.create(ShiftScheduleSlideover, { destroyOnClose: true, props: { operationId: schedule.operationId, schedule } }).open() as ShiftScheduleDto | false

  /** Saves a schedule's coverage, handover and approval (the inline settings form). Resolves with the saved schedule or `false`. */
  async function saveScheduleSettings(schedule: ShiftScheduleDto, settings: ShiftScheduleSettings): Promise<ShiftScheduleDto | false> {
    return await run(
      () => $fetch<ShiftScheduleDto>(shiftsApi.admin.schedule(schedule.id), { method: 'PATCH', body: settings }),
      { success: t('admin.settingsSaved', 'Saved the settings of {name}', { name: tr(schedule.name) }), error: t('admin.settingsFailed', 'Could not save the settings') },
    ) ?? false
  }

  /** A short label of how a schedule's shifts change hands, e.g. "Trade only · A lead approves". */
  function settingsLabel(settings: ShiftScheduleSettings): string {
    const handover = settings.coverage === 'all'
      ? t('admin.settingsAll', 'Every shift, trade only')
      : settings.handover === 'trade'
        ? t('admin.settingsTrade', 'Trade only')
        : settings.handover === 'release'
          ? t('admin.settingsRelease', 'Give away only')
          : t('admin.settingsBoth', 'Trade or give away')
    const approval = settings.approval === 'lead' ? t('admin.approvals.lead', 'A lead approves') : t('admin.approvals.peer', 'Between volunteers')
    return `${handover} · ${approval}`
  }

  /** Who a swap waiting for approval moves where: "Ann gives it to Bo", or for a trade "Ann trades it with Bo for Bar, 28 Jun 18:00". */
  function swapSummary(swap: ShiftSwapDto): string {
    const accepted = swap.offers?.find(offer => offer.status === 'accepted')
    const names = { from: swap.owner.name ?? '', to: accepted?.person?.name ?? '' }
    const back = accepted?.offeredShift
    return back
      ? t('swaps.tradesWith', '{from} trades it with {to} for {team}, {when}', { ...names, team: tr(back.teamName), when: format.range(back.startsAt, back.endsAt) })
      : t('swaps.fromTo', '{from} gives it to {to}', names)
  }

  /**
   * Whether the schedule's settings of now still allow a swap waiting for approval (its accepted offer's kind). One they
   * no longer allow cannot be approved (the server answers 409 `handover_not_allowed`): only rejected.
   */
  function swapAllowed(swap: ShiftSwapDto): boolean {
    const accepted = swap.offers?.find(offer => offer.status === 'accepted')
    return allowsSwapKind(swap.settings, accepted ? offerKind(accepted) : swap.kind)
  }

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
    await overlay.create(ShiftBulkSlideover, { destroyOnClose: true, props: { scheduleId: schedule.id, operationId: schedule.operationId, teams: context.teams, roles: context.roles } }).open() as ShiftDto[] | false
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
      description: t('perks.deleteDescription', 'Shifts no longer earn it. A perk somebody earned already cannot be deleted: change it instead.'),
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

  const createStation = async (schedule: ShiftScheduleDto, teams: ShiftsScheduleContext['teams']) =>
    await overlay.create(ShiftStationSlideover, { destroyOnClose: true, props: { scheduleId: schedule.id, operationId: schedule.operationId, teams } }).open() as ShiftStationDto | false
  const editStation = async (station: ShiftStationDto, schedule: ShiftScheduleDto, teams: ShiftsScheduleContext['teams']) =>
    await overlay.create(ShiftStationSlideover, { destroyOnClose: true, props: { scheduleId: schedule.id, operationId: schedule.operationId, teams, station } }).open() as ShiftStationDto | false

  async function deleteStation(station: ShiftStationDto): Promise<boolean> {
    const name = tr(station.name)
    const confirmed = await confirm({
      title: t('stations.deleteTitle', 'Delete {name}?', { name }),
      description: t('stations.deleteDescription', 'Its screen stops working at once. Volunteers check in at another station, by location or with a lead.'),
      confirmText: t('stations.delete', 'Delete station'),
      destructive: true,
    })
    if (!confirmed) return false
    return await run(
      () => $fetch(shiftsApi.admin.station(station.id), { method: 'DELETE' }).then(() => true),
      { success: t('stations.deleted', 'Deleted {name}', { name }), error: t('stations.deleteFailed', 'Could not delete the station') },
    ) === true
  }

  /** The row menu of a station: Open its screen | Edit | Delete. */
  function stationMenu(station: ShiftStationDto, context: { schedule: ShiftScheduleDto, teams: ShiftsScheduleContext['teams'], changed: () => unknown }): DropdownMenuItem[][] {
    return [
      [{ label: t('stations.open', 'Open station screen'), icon: 'i-lucide-qr-code', onSelect: () => navigateTo(links.station(station.id)) }],
      [{ label: t('stations.editTitle', 'Edit station'), icon: 'i-lucide-pencil', onSelect: async () => (await editStation(station, context.schedule, context.teams)) && context.changed() }],
      [{ label: t('stations.delete', 'Delete station'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: async () => (await deleteStation(station)) && context.changed() }],
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
    saveScheduleSettings,
    settingsLabel,
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
    swapSummary,
    swapAllowed,
    scheduleMenu,
    roleMenu,
    subscribe,
    broadcast,
    broadcastToTeam,
    createPerk,
    editPerk,
    deletePerk,
    perkMenu,
    createStation,
    editStation,
    deleteStation,
    stationMenu,
  }
}
