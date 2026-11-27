import type { DropdownMenuItem } from '@nuxt/ui'
import CampaignListFormSlideover from '../components/CampaignListFormSlideover.vue'
import { campaignsApi } from '../../utils/api'
import type { CampaignAddAccountsPreviewDto, CampaignAddAccountsResultDto, CampaignListDto } from '../../../types'
import { $fetch, navigateTo, useAction, useCampaignsLinks, useCampaignsTranslate, useConfirmDialog, useErrorToast, useModuleT, useOverlay, useToast } from '#imports'

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
 * `remove` (confirms first, and says how many subscriptions go with it), `addAccounts` ("Add all current accounts" of a
 * list that adds new accounts automatically: confirms with the number first) and `menu(list)`: Open, Edit,
 * Add all current accounts | Delete.
 */
export function useCampaignListActions() {
  const t = useModuleT('campaigns')
  const tr = useCampaignsTranslate()
  const links = useCampaignsLinks()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const showError = useErrorToast()
  const toast = useToast()
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

  /** "Add all current accounts" of an `auto` list: says how many would be added, then adds them. Resolves with the number added, or `false`. */
  async function addAccounts(list: CampaignListDto): Promise<number | false> {
    const name = tr(list.name)
    let preview: CampaignAddAccountsPreviewDto
    try {
      preview = await $fetch<CampaignAddAccountsPreviewDto>(campaignsApi.admin.accounts(list.id))
    }
    catch (error) {
      showError(error, t('admin.addAccountsFailed', 'Could not add the accounts'))
      return false
    }
    const confirmed = await confirm({
      title: t('admin.addAccountsTitle', 'Add all current accounts to {name}?', { name }),
      description: preview.accounts === 0
        ? t('admin.addAccountsNone', 'Every account is on the list already, or unsubscribed from it. Nobody is added.')
        : preview.accounts === 1
          ? t('admin.addAccountsOne', '1 account is added as a subscriber on email. People who unsubscribed before are never added back.')
          : t('admin.addAccountsMany', '{count} accounts are added as subscribers on email. People who unsubscribed before are never added back.', { count: preview.accounts }),
      confirmText: t('admin.addAccountsAction', 'Add all current accounts'),
    })
    if (!confirmed || preview.accounts === 0) return false
    const result = await run(
      () => $fetch<CampaignAddAccountsResultDto>(campaignsApi.admin.accounts(list.id), { method: 'POST' }),
      { error: t('admin.addAccountsFailed', 'Could not add the accounts') },
    )
    if (!result) return false
    toast.add({
      color: 'success',
      icon: 'i-lucide-check',
      title: result.added === 1
        ? t('admin.addedAccountsOne', 'Added 1 account to {name}', { name })
        : t('admin.addedAccountsMany', 'Added {count} accounts to {name}', { count: result.added, name }),
    })
    return result.added
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
    if (list.signupMode === 'auto') {
      items.push({
        label: t('admin.addAccountsAction', 'Add all current accounts'),
        icon: 'i-lucide-user-plus',
        onSelect: async () => {
          if (await addAccounts(list) !== false) await options.onChanged?.()
        },
      })
    }
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

  return { create, edit, remove, addAccounts, menu }
}
