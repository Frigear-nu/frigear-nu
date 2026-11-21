import type { DropdownMenuItem } from '@nuxt/ui'
import FaqItemFormSlideover from '../components/FaqItemFormSlideover.vue'
import type { StaffFaqGroup, StaffFaqItem } from '../utils/admin-faq'
import { faqApi } from '../../utils/api'
import { $fetch, useAction, useConfirmDialog, useFaqTranslate, useModuleT, useOverlay } from '#imports'

export type FaqItemMenuOptions = {
  /** Runs after the item was changed, deleted, published or unpublished (refresh the list). */
  onChanged?: () => unknown
}

/**
 * What staff can do with the items of a group, on the group page: `create` and `edit` (a slideover), `publish`,
 * `unpublish`, `remove` (confirms first) and `menu(group, item)`: Edit | Publish or Unpublish | Delete. Each resolves
 * with the result, or `false` when cancelled or refused (a failed publish shows the missing languages in a toast).
 */
export function useFaqItemActions() {
  const t = useModuleT('faq')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const tr = useFaqTranslate()

  async function create(group: StaffFaqGroup): Promise<StaffFaqItem | false> {
    return await overlay.create(FaqItemFormSlideover, { destroyOnClose: true, props: { group } }).open() as StaffFaqItem | false
  }

  async function edit(group: StaffFaqGroup, item: StaffFaqItem): Promise<StaffFaqItem | false> {
    return await overlay.create(FaqItemFormSlideover, { destroyOnClose: true, props: { group, item } }).open() as StaffFaqItem | false
  }

  async function publish(item: StaffFaqItem): Promise<StaffFaqItem | false> {
    const published = await run(
      () => $fetch<StaffFaqItem>(faqApi.admin.publish(item.id), { method: 'POST' }),
      { success: t('admin.published', 'Published {name}', { name: tr(item.question) }), error: t('admin.publishFailed', 'Could not publish the question') },
    )
    return published ?? false
  }

  async function unpublish(item: StaffFaqItem): Promise<StaffFaqItem | false> {
    const draft = await run(
      () => $fetch<StaffFaqItem>(faqApi.admin.unpublish(item.id), { method: 'POST' }),
      { success: t('admin.unpublished', 'Unpublished {name}', { name: tr(item.question) }), error: t('admin.unpublishFailed', 'Could not unpublish the question') },
    )
    return draft ?? false
  }

  async function remove(item: StaffFaqItem): Promise<boolean> {
    const name = tr(item.question)
    const confirmed = await confirm({
      title: t('admin.deleteItemTitle', 'Delete this question?'),
      description: t('admin.deleteItemDescription', '"{name}" disappears from every page that shows its group.', { name }),
      confirmText: t('admin.deleteItemAction', 'Delete question'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(faqApi.admin.item(item.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.itemDeleted', 'Deleted the question'), error: t('admin.itemDeleteFailed', 'Could not delete the question') },
    )
    return done === true
  }

  function menu(group: StaffFaqGroup, item: StaffFaqItem, options: FaqItemMenuOptions = {}): DropdownMenuItem[][] {
    const changed = async (ok: unknown) => {
      if (ok) await options.onChanged?.()
    }
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => changed(await edit(group, item)),
    }]
    const state: DropdownMenuItem[] = [item.status === 'published'
      ? { label: t('admin.unpublish', 'Unpublish'), icon: 'i-lucide-eye-off', onSelect: async () => changed(await unpublish(item)) }
      : { label: t('admin.publish', 'Publish'), icon: 'i-lucide-send', onSelect: async () => changed(await publish(item)) }]
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteItemAction', 'Delete question'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => changed(await remove(item)),
    }]
    return [edits, state, destructive]
  }

  return { create, edit, publish, unpublish, remove, menu }
}
