import type { DropdownMenuItem } from '@nuxt/ui'
import HelpChecklistFormSlideover from '../components/HelpChecklistFormSlideover.vue'
import type { StaffHelpChecklist } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { $fetch, navigateTo, useAction, useConfirmDialog, useHelpCenterPaths, useHelpCenterTranslate, useModuleT, useOverlay } from '#imports'

export type HelpChecklistMenuOptions = {
  /** Runs after the checklist was edited or deleted (refresh the list). */
  onChanged?: () => unknown
  /** Leave out "Open", e.g. on the checklist's own page. Defaults to `true`. */
  open?: boolean
}

/**
 * What staff can do with a checklist: `create` (a slideover; goes to the new checklist's page and resolves with it, or
 * `false` when cancelled), `edit`, `remove` (confirms first) and `menu(checklist)`: Open | Edit | Delete.
 */
export function useHelpChecklistActions() {
  const t = useModuleT('helpCenter')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const paths = useHelpCenterPaths()
  const tr = useHelpCenterTranslate()

  async function create(): Promise<StaffHelpChecklist | false> {
    const created = await overlay.create(HelpChecklistFormSlideover, { destroyOnClose: true, props: { checklist: undefined } }).open() as StaffHelpChecklist | false
    if (!created) return false
    const to = paths.adminChecklist(created.id)
    if (to) await navigateTo(to)
    return created
  }

  async function edit(checklist: StaffHelpChecklist): Promise<StaffHelpChecklist | false> {
    return await overlay.create(HelpChecklistFormSlideover, { destroyOnClose: true, props: { checklist } }).open() as StaffHelpChecklist | false
  }

  async function remove(checklist: Pick<StaffHelpChecklist, 'id' | 'name'>): Promise<boolean> {
    const name = tr(checklist.name)
    const confirmed = await confirm({
      title: t('admin.deleteChecklistTitle', 'Delete {name}?', { name }),
      description: t('admin.deleteChecklistDescription', 'People no longer see it. What they have read stays recorded on the articles.'),
      confirmText: t('admin.deleteChecklistAction', 'Delete checklist'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(helpCenterApi.admin.checklist(checklist.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.checklistDeleted', 'Deleted {name}', { name }), error: t('admin.checklistDeleteFailed', 'Could not delete the checklist') },
    )
    return done === true
  }

  function menu(checklist: StaffHelpChecklist, options: HelpChecklistMenuOptions = {}): DropdownMenuItem[][] {
    const main: DropdownMenuItem[] = []
    const to = paths.adminChecklist(checklist.id)
    if (options.open !== false && to) main.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to })
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        if (await edit(checklist)) await options.onChanged?.()
      },
    }]
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteChecklistAction', 'Delete checklist'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => {
        if (await remove(checklist)) await options.onChanged?.()
      },
    }]
    return [main, edits, destructive].filter(items => items.length)
  }

  return { create, edit, remove, menu }
}
