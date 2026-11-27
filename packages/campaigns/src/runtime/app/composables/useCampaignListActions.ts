import type { DropdownMenuItem } from '@nuxt/ui'
import CampaignListFormSlideover from '../components/CampaignListFormSlideover.vue'
import { campaignsApi } from '../../utils/api'
import type { CampaignListDto } from '../../../types'
import { $fetch, navigateTo, useAction, useCampaignsLinks, useCampaignsTranslate, useConfirmDialog, useModuleT, useOverlay } from '#imports'

export type CampaignListMenuOptions = {
  /** Shows "Open" first (off on the list's own page). Default `true`. */
  open?: boolean
  /** Runs after the list was edited. */
  onChanged?: () => unknown
  /** Runs after the list was deleted. */
  onRemoved?: () => unknown
}

/**
 * What staff can do with a list: `create` and `edit` (a slideover, resolving with the saved list or `false`),
 * `remove` (confirms first, and says how many subscriptions go with it) and `menu(list)`: Open, Edit | Delete.
 */
export function useCampaignListActions() {
  const t = useModuleT('campaigns')
  const tr = useCampaignsTranslate()
  const links = useCampaignsLinks()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()

  const create = async (): Promise<CampaignListDto | false> =>
    await overlay.create(CampaignListFormSlideover, { destroyOnClose: true }).open() as CampaignListDto | false

  const edit = async (list: CampaignListDto): Promise<CampaignListDto | false> =>
    await overlay.create(CampaignListFormSlideover, { destroyOnClose: true, props: { list } }).open() as CampaignListDto | false

  async function remove(list: CampaignListDto): Promise<boolean> {
    const name = tr(list.name)
    const subscriptions = Object.values(list.counts).reduce((sum, entry) => sum + entry.active + entry.pending + entry.unsubscribed, 0)
    const confirmed = await confirm({
      title: t('admin.deleteTitle', 'Delete {name}?', { name }),
      description: subscriptions
        ? t('admin.deleteDescription', 'Its {count} subscriptions and their consent records are deleted with it. This cannot be undone.', { count: subscriptions })
        : t('admin.deleteEmptyDescription', 'Nobody is subscribed to it yet. This cannot be undone.'),
      confirmText: t('admin.deleteAction', 'Delete list'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(campaignsApi.admin.list(list.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.deleted', 'Deleted {name}', { name }), error: t('admin.deleteFailed', 'Could not delete the list') },
    )
    return done === true
  }

  function menu(list: CampaignListDto, options: CampaignListMenuOptions = {}): DropdownMenuItem[][] {
    const items: DropdownMenuItem[] = []
    const to = links.adminList(list.id)
    if (options.open !== false && to) {
      items.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', onSelect: () => navigateTo(to) })
    }
    items.push({
      label: t('admin.edit', 'Edit list'),
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        if (await edit(list)) await options.onChanged?.()
      },
    })
    return [
      items,
      [{
        label: t('admin.deleteAction', 'Delete list'),
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: async () => {
          if (await remove(list)) await options.onRemoved?.()
        },
      }],
    ]
  }

  return { create, edit, remove, menu }
}
