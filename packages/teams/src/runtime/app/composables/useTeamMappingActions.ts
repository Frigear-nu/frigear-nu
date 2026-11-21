import type { DropdownMenuItem } from '@nuxt/ui'
import type { MaybeRefOrGetter } from 'vue'
import TeamMappingSlideover from '../components/TeamMappingSlideover.vue'
import type { StaffTeam, StaffTeamLadder, StaffTeamMapping } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import type { TeamOwner } from '../../../types'
import { $fetch, toValue, useAction, useConfirmDialog, useModuleT, useOverlay } from '#imports'

/**
 * What staff can do with the role mapping rules of an owner (seen from one `team`, when given): `create`, `edit`,
 * `remove` (confirms first) and `menu(rule)`: Edit | Delete.
 */
export function useTeamMappingActions(context: MaybeRefOrGetter<{ owner: TeamOwner, ladders: StaffTeamLadder[], team?: StaffTeam }>) {
  const t = useModuleT('teams')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()

  const open = (mapping?: StaffTeamMapping) =>
    overlay.create(TeamMappingSlideover, { destroyOnClose: true, props: { ...toValue(context), mapping } }).open() as Promise<StaffTeamMapping | false>

  const create = () => open()
  const edit = (mapping: StaffTeamMapping) => open(mapping)

  async function remove(mapping: StaffTeamMapping): Promise<boolean> {
    const confirmed = await confirm({
      title: t('admin.deleteMappingTitle', 'Delete this mapping rule?'),
      description: t('admin.deleteMappingDescription', 'People who only held a role through it lose that role on the next request.'),
      confirmText: t('admin.deleteMappingAction', 'Delete mapping rule'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(teamsApi.admin.mapping(mapping.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.mappingDeleted', 'Deleted the mapping rule'), error: t('admin.deleteMappingFailed', 'Could not delete the mapping rule') },
    )
    return done === true
  }

  function menu(mapping: StaffTeamMapping, options: { onChanged?: () => unknown } = {}): DropdownMenuItem[][] {
    return [
      [{
        label: t('admin.edit', 'Edit'),
        icon: 'i-lucide-pencil',
        onSelect: async () => {
          if (await edit(mapping)) await options.onChanged?.()
        },
      }],
      [{
        label: t('admin.deleteMappingAction', 'Delete mapping rule'),
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: async () => {
          if (await remove(mapping)) await options.onChanged?.()
        },
      }],
    ]
  }

  return { create, edit, remove, menu }
}
