import type { DropdownMenuItem } from '@nuxt/ui'
import type { MaybeRefOrGetter } from 'vue'
import TeamMemberSlideover from '../components/TeamMemberSlideover.vue'
import type { StaffTeam, StaffTeamLadder, StaffTeamMember } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import { $fetch, toValue, useAction, useConfirmDialog, useModuleT, useOverlay, useTeamsTranslate } from '#imports'

/**
 * What staff can do with the members of `team`: `add` (a slideover with a user search), `changeRole` (for a mapped
 * member it assigns the role explicitly), `remove` (explicit members only, confirms first) and `menu(member)`:
 * Change role | Remove.
 */
export function useTeamMemberActions(team: MaybeRefOrGetter<StaffTeam>, ladders: MaybeRefOrGetter<StaffTeamLadder[]>) {
  const t = useModuleT('teams')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const tr = useTeamsTranslate()

  const open = (member?: StaffTeamMember) =>
    overlay.create(TeamMemberSlideover, { destroyOnClose: true, props: { team: toValue(team), ladders: toValue(ladders), member } }).open() as Promise<StaffTeamMember | false>

  /** Opens the add form. Resolves with the new member, or `false`. */
  const add = () => open()

  /** Opens the role form. Resolves with the saved member, or `false`. */
  const changeRole = (member: StaffTeamMember) => open(member)

  async function remove(member: StaffTeamMember): Promise<boolean> {
    const name = member.name ?? `#${member.userId}`
    const confirmed = await confirm({
      title: t('admin.removeMemberTitle', 'Remove {name}?', { name }),
      description: t('admin.removeMemberDescription', '{name} loses their role on {team}. A mapping rule may still give them one.', { name, team: tr(toValue(team).name) }),
      confirmText: t('admin.removeMemberAction', 'Remove member'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(teamsApi.admin.member(toValue(team).id, member.userId), { method: 'DELETE' }).then(() => true),
      { success: t('admin.memberRemoved', 'Removed {name}', { name }), error: t('admin.removeMemberFailed', 'Could not remove the member') },
    )
    return done === true
  }

  function menu(member: StaffTeamMember, options: { onChanged?: () => unknown } = {}): DropdownMenuItem[][] {
    const edits: DropdownMenuItem[] = [{
      label: member.source === 'mapped' ? t('admin.assignRole', 'Assign role') : t('admin.changeRole', 'Change role'),
      icon: 'i-lucide-user-cog',
      onSelect: async () => {
        if (await changeRole(member)) await options.onChanged?.()
      },
    }]
    const destructive: DropdownMenuItem[] = member.source === 'explicit'
      ? [{
          label: t('admin.removeMemberAction', 'Remove member'),
          icon: 'i-lucide-trash-2',
          color: 'error',
          onSelect: async () => {
            if (await remove(member)) await options.onChanged?.()
          },
        }]
      : []
    return [edits, destructive].filter(group => group.length)
  }

  return { add, changeRole, remove, menu }
}
