import type { DropdownMenuItem } from '@nuxt/ui'
import TeamFormSlideover from '../components/TeamFormSlideover.vue'
import type { StaffTeam } from '../utils/admin-team'
import { teamsApi } from '../../utils/api'
import type { TeamOwner } from '../../../types'
import { $fetch, navigateTo, useAction, useConfirmDialog, useModuleT, useOverlay, useTeamLinks, useTeamsTranslate } from '#imports'

export type TeamMenuOptions = {
  /** Runs after the team was deleted (refresh a list, leave the team page). */
  onRemoved?: () => unknown
  /** Runs after the team was edited. */
  onChanged?: () => unknown
  /** Leave out "Open", e.g. on the team's own page. Defaults to `true`. */
  open?: boolean
}

/**
 * What staff can do with a team, shared by the list, the team page and the Teams tab of an owner: `create` (a
 * slideover, optionally for a fixed `owner`; navigates to the new team unless `navigate: false`), `edit`, `remove`
 * (confirms first) and `menu(team)`: Open | Edit | Delete.
 */
export function useTeamActions() {
  const t = useModuleT('teams')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const links = useTeamLinks()
  const tr = useTeamsTranslate()

  /** Opens the create form. Resolves with the new team, or `false` when cancelled. */
  async function create(options: { owner?: TeamOwner, navigate?: boolean } = {}): Promise<StaffTeam | false> {
    const created = await overlay.create(TeamFormSlideover, { destroyOnClose: true, props: { team: undefined, owner: options.owner } }).open() as StaffTeam | false
    if (!created) return false
    if (options.navigate !== false) await navigateTo(links.adminTeam(created.id))
    return created
  }

  /** Opens the edit form. Resolves with the saved team, or `false` when cancelled. */
  async function edit(team: StaffTeam): Promise<StaffTeam | false> {
    return await overlay.create(TeamFormSlideover, { destroyOnClose: true, props: { team } }).open() as StaffTeam | false
  }

  async function remove(team: StaffTeam): Promise<boolean> {
    const name = tr(team.name)
    const confirmed = await confirm({
      title: t('admin.deleteTitle', 'Delete {name}?', { name }),
      description: t('admin.deleteDescription', 'Its {count} members lose their role on it, and the mapping rules for this team are deleted too.', { count: team.memberCount }),
      confirmText: t('admin.deleteAction', 'Delete team'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      // 204: resolves with no body, so map success to `true` (`run` resolves `undefined` on failure).
      () => $fetch(teamsApi.admin.team(team.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.deleted', 'Deleted {name}', { name }), error: t('admin.deleteFailed', 'Could not delete the team') },
    )
    return done === true
  }

  function menu(team: StaffTeam, options: TeamMenuOptions = {}): DropdownMenuItem[][] {
    const main: DropdownMenuItem[] = options.open === false
      ? []
      : [{ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: links.adminTeam(team.id) }]
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        if (await edit(team)) await options.onChanged?.()
      },
    }]
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteAction', 'Delete team'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => {
        if (await remove(team)) await options.onRemoved?.()
      },
    }]
    return [main, edits, destructive].filter(group => group.length)
  }

  return { create, edit, remove, menu }
}
