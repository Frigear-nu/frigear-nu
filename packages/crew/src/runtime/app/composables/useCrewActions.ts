import type { DropdownMenuItem } from '@nuxt/ui'
import type { UserPickerCreateInitial, UserPickerOption } from '@frigear-nu/users/api'
import CrewAddMemberSlideover from '../components/CrewAddMemberSlideover.vue'
import CrewInviteSlideover from '../components/CrewInviteSlideover.vue'
import CrewMemberSlideover from '../components/CrewMemberSlideover.vue'
import type { CrewLadder, CrewTeamOption, StaffCrewMember } from '../utils/admin-crew'
import { crewApi } from '../../utils/api'
import { canMoveCrew } from '../../utils/status'
import type { CreatedCrewInviteDto, CrewInviteDto } from '../../../types'
import { $fetch, useAction, useConfirmDialog, useModuleT, useOverlay, useToast } from '#imports'

export type CrewMenuOptions = {
  /** The teams and ladders of the operation, for the member form. */
  teams: CrewTeamOption[]
  ladders: CrewLadder[]
  /** Whether the caller holds `crew:pii`: the member form then shows the application's answers. */
  pii?: boolean
  /** Runs after something changed (refresh the list). */
  onChanged?: () => unknown
}

/** Who the "Add crew member" form starts with: a person to preselect, or what is known of someone without an account. */
export type CrewAddMemberOptions = Pick<CrewMenuOptions, 'teams' | 'ladders'> & {
  /** Preselects this user (`selected` gives their name). */
  userId?: number
  selected?: UserPickerOption[]
  /** Offers "Create user" prefilled with these (an inbox contact without an account). */
  prefill?: UserPickerCreateInitial
}

/**
 * What staff can do with an operation's crew, shared by the Crew tab's list and member form: `add` (a person, approved at
 * once), `approve`, `reject` (confirms
 * first) and `waitlist` a person, `approveMany`, `open` (the member form: team, role and the application's answers),
 * `createInvite` (a form that shows the link once), `revokeInvite` (confirms first) and `menu(member)`, the row menu: Open |
 * Approve, Put on the waiting list | Reject.
 */
export function useCrewActions() {
  const t = useModuleT('crew')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const toast = useToast()

  const nameOf = (member: StaffCrewMember) => member.name ?? `#${member.userId}`

  async function approve(member: StaffCrewMember): Promise<StaffCrewMember | false> {
    const approved = await run(
      () => $fetch<StaffCrewMember>(crewApi.admin.approve(member.id), { method: 'POST', body: {} }),
      { success: t('admin.approved', 'Approved {name}', { name: nameOf(member) }), error: t('admin.approveFailed', 'Could not approve the person') },
    )
    return approved ?? false
  }

  async function reject(member: StaffCrewMember): Promise<StaffCrewMember | false> {
    const name = nameOf(member)
    const confirmed = await confirm({
      title: t('admin.rejectTitle', 'Reject {name}?', { name }),
      description: member.crewStatus === 'approved'
        ? t('admin.rejectApprovedDescription', '{name} loses their place on the crew and is told by email. The next person on the waiting list may move up.', { name })
        : t('admin.rejectDescription', '{name} is told by email that they did not get a place on the crew.', { name }),
      confirmText: t('admin.rejectAction', 'Reject application'),
      destructive: true,
    })
    if (!confirmed) return false
    const rejected = await run(
      () => $fetch<StaffCrewMember>(crewApi.admin.reject(member.id), { method: 'POST' }),
      { success: t('admin.rejected', 'Rejected {name}', { name }), error: t('admin.rejectFailed', 'Could not reject the person') },
    )
    return rejected ?? false
  }

  async function waitlist(member: StaffCrewMember): Promise<StaffCrewMember | false> {
    const waitlisted = await run(
      () => $fetch<StaffCrewMember>(crewApi.admin.waitlist(member.id), { method: 'POST' }),
      { success: t('admin.waitlisted', 'Put {name} on the waiting list', { name: nameOf(member) }), error: t('admin.waitlistFailed', 'Could not change the status') },
    )
    return waitlisted ?? false
  }

  /** Approves several people at once. Resolves with how many were approved and skipped, or `false` on failure. */
  async function approveMany(operationId: string, ids: string[]): Promise<{ approved: number, skipped: number } | false> {
    const result = await run(
      () => $fetch<{ approved: StaffCrewMember[], skipped: string[] }>(crewApi.admin.approveMany(operationId), { method: 'POST', body: { ids } }),
      { error: t('admin.approveFailed', 'Could not approve the person') },
    )
    if (!result) return false
    const summary = { approved: result.approved.length, skipped: result.skipped.length }
    toast.add({
      title: t('admin.approvedMany', 'Approved {count} people', { count: summary.approved }),
      description: summary.skipped ? t('admin.skippedMany', '{count} could not be approved and were left as they are.', { count: summary.skipped }) : undefined,
      color: summary.skipped ? 'warning' : 'success',
      icon: 'i-lucide-check',
    })
    return summary
  }

  /** Opens the member form. Resolves with the saved member, or `false` when cancelled. */
  async function open(member: StaffCrewMember, options: Omit<CrewMenuOptions, 'onChanged'>): Promise<StaffCrewMember | false> {
    return await overlay.create(CrewMemberSlideover, { destroyOnClose: true, props: { member, teams: options.teams, ladders: options.ladders, pii: options.pii ?? false } }).open() as StaffCrewMember | false
  }

  /** Opens the "Add crew member" form. Resolves with the added member, or `false` when cancelled. */
  async function add(operationId: string, options: CrewAddMemberOptions): Promise<StaffCrewMember | false> {
    return await overlay.create(CrewAddMemberSlideover, { destroyOnClose: true, props: { operationId, ...options } }).open() as StaffCrewMember | false
  }

  /** Opens the invite form; once created it shows the link. Resolves with the new invite, or `false`. */
  async function createInvite(operationId: string, options: Pick<CrewMenuOptions, 'teams' | 'ladders'>): Promise<CreatedCrewInviteDto | false> {
    return await overlay.create(CrewInviteSlideover, { destroyOnClose: true, props: { operationId, teams: options.teams, ladders: options.ladders } }).open() as CreatedCrewInviteDto | false
  }

  async function revokeInvite(invite: CrewInviteDto): Promise<boolean> {
    const confirmed = await confirm({
      title: t('admin.revokeInviteTitle', 'Revoke this invite?'),
      description: t('admin.revokeInviteDescription', 'The link stops working. People who joined with it stay on the crew.'),
      confirmText: t('admin.revokeInviteAction', 'Revoke invite'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(crewApi.admin.invite(invite.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.inviteRevoked', 'Revoked the invite'), error: t('admin.revokeInviteFailed', 'Could not revoke the invite') },
    )
    return done === true
  }

  function menu(member: StaffCrewMember, options: CrewMenuOptions): DropdownMenuItem[][] {
    const changed = async (result: StaffCrewMember | false) => {
      if (result) await options.onChanged?.()
    }
    const main: DropdownMenuItem[] = [{
      label: t('admin.open', 'Open application'),
      icon: 'i-lucide-arrow-right',
      onSelect: async () => changed(await open(member, options)),
    }]
    const moves: DropdownMenuItem[] = []
    if (canMoveCrew(member.crewStatus, 'approved')) {
      moves.push({ label: t('admin.approveAction', 'Approve application'), icon: 'i-lucide-user-check', onSelect: async () => changed(await approve(member)) })
    }
    if (canMoveCrew(member.crewStatus, 'waitlisted')) {
      moves.push({ label: t('admin.waitlistAction', 'Move to waiting list'), icon: 'i-lucide-hourglass', onSelect: async () => changed(await waitlist(member)) })
    }
    const destructive: DropdownMenuItem[] = canMoveCrew(member.crewStatus, 'rejected')
      ? [{ label: t('admin.rejectAction', 'Reject application'), icon: 'i-lucide-user-x', color: 'error', onSelect: async () => changed(await reject(member)) }]
      : []
    return [main, moves, destructive].filter(group => group.length)
  }

  return { add, approve, reject, waitlist, approveMany, open, createInvite, revokeInvite, menu }
}
