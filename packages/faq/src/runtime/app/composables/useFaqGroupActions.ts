import type { DropdownMenuItem } from '@nuxt/ui'
import FaqGroupFormSlideover from '../components/FaqGroupFormSlideover.vue'
import type { StaffFaqGroup } from '../utils/admin-faq'
import { faqApi } from '../../utils/api'
import { $fetch, navigateTo, useAction, useConfirmDialog, useFaqLinks, useFaqTranslate, useModuleT, useOverlay } from '#imports'

export type FaqGroupMenuOptions = {
  /** Items for the middle group, between the edits and the delete action. */
  extra?: DropdownMenuItem[]
  /** Runs after the group was deleted (refresh a list, leave the group page). */
  onRemoved?: () => unknown
  /** Runs after the group was edited (refresh a list or the group page). */
  onChanged?: () => unknown
  /** Leave out "Open", e.g. on the group's own page. Defaults to `true`. */
  open?: boolean
}

/**
 * What staff can do with a group, shared by the list and the group page: `create` (a slideover; navigates to the new
 * group and resolves with it, or `false` when cancelled), `edit` (the same slideover), `remove` (confirms first) and
 * `menu(group)`, the row menu in the same order everywhere: Open | Edit | extras | Delete.
 */
export function useFaqGroupActions() {
  const t = useModuleT('faq')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const links = useFaqLinks()
  const tr = useFaqTranslate()

  /** Opens the create form and, once saved, goes to the new group's page. Resolves with it, or `false`. */
  async function create(): Promise<StaffFaqGroup | false> {
    const created = await overlay.create(FaqGroupFormSlideover, { destroyOnClose: true, props: { group: undefined } }).open() as StaffFaqGroup | false
    if (!created) return false
    await navigateTo(links.adminGroup(created.id))
    return created
  }

  /** Opens the edit form. Resolves with the saved group, or `false` when cancelled. */
  async function edit(group: StaffFaqGroup): Promise<StaffFaqGroup | false> {
    return await overlay.create(FaqGroupFormSlideover, { destroyOnClose: true, props: { group } }).open() as StaffFaqGroup | false
  }

  async function remove(group: Pick<StaffFaqGroup, 'id' | 'title' | 'itemCount'>): Promise<boolean> {
    const name = tr(group.title)
    const confirmed = await confirm({
      title: t('admin.deleteGroupTitle', 'Delete {name}?', { name }),
      description: group.itemCount
        ? t('admin.deleteGroupDescription', 'Its {count} questions are deleted with it, and pages that show it will show nothing.', { count: group.itemCount })
        : t('admin.deleteEmptyGroupDescription', 'Pages that show it will show nothing.'),
      confirmText: t('admin.deleteGroupAction', 'Delete FAQ group'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      // 204: resolves with no body, so map success to `true` (`run` resolves `undefined` on failure).
      () => $fetch(faqApi.admin.group(group.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.groupDeleted', 'Deleted {name}', { name }), error: t('admin.groupDeleteFailed', 'Could not delete the group') },
    )
    return done === true
  }

  function menu(group: StaffFaqGroup, options: FaqGroupMenuOptions = {}): DropdownMenuItem[][] {
    const main: DropdownMenuItem[] = []
    if (options.open !== false) {
      main.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: links.adminGroup(group.id) })
    }
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        if (await edit(group)) await options.onChanged?.()
      },
    }]
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteGroupAction', 'Delete FAQ group'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => {
        if (await remove(group)) await options.onRemoved?.()
      },
    }]
    return [main, edits, options.extra ?? [], destructive].filter(items => items.length)
  }

  return { create, edit, remove, menu }
}
