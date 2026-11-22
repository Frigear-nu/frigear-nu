import type { DropdownMenuItem } from '@nuxt/ui'
import HelpCategoryFormSlideover from '../components/HelpCategoryFormSlideover.vue'
import HelpCategoryOrderSlideover from '../components/HelpCategoryOrderSlideover.vue'
import type { StaffHelpCategory } from '../utils/admin'
import type { HelpCategoryDisplay } from '../../../types'
import { helpCenterApi } from '../../utils/api'
import { $fetch, useAction, useConfirmDialog, useHelpCenterTranslate, useModuleT, useOverlay } from '#imports'

export type HelpCategoryMenuOptions = {
  /** The categories, for the parent picker of the form. */
  categories: () => StaffHelpCategory[]
  /** Runs after the category was edited or deleted (refresh the list). */
  onChanged?: () => unknown
}

/**
 * What staff can do with a category: `create` and `edit` (a slideover; each resolves with the saved category, or `false`
 * when cancelled), `reorder` (a slideover that saves each move; resolves with whether the order changed), `remove`
 * (confirms first, and says what is affected) and `menu(category)`: Edit, Order articles | Delete.
 */
export function useHelpCategoryActions() {
  const t = useModuleT('helpCenter')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const tr = useHelpCenterTranslate()

  /** `display` presets how the new category shows (the FAQ page starts at `cards`). */
  async function create(categories: StaffHelpCategory[], display?: HelpCategoryDisplay): Promise<StaffHelpCategory | false> {
    return await overlay.create(HelpCategoryFormSlideover, { destroyOnClose: true, props: { category: undefined, categories, display } }).open() as StaffHelpCategory | false
  }

  async function edit(category: StaffHelpCategory, categories: StaffHelpCategory[]): Promise<StaffHelpCategory | false> {
    return await overlay.create(HelpCategoryFormSlideover, { destroyOnClose: true, props: { category, categories } }).open() as StaffHelpCategory | false
  }

  async function reorder(category: StaffHelpCategory): Promise<boolean> {
    return await overlay.create(HelpCategoryOrderSlideover, { destroyOnClose: true, props: { category } }).open() as boolean
  }

  async function remove(category: StaffHelpCategory): Promise<boolean> {
    const name = tr(category.name)
    const confirmed = await confirm({
      title: t('admin.deleteCategoryTitle', 'Delete {name}?', { name }),
      description: category.articleCount
        ? t('admin.deleteCategoryBlocked', 'It still has {count} articles. Move or delete them first.', { count: category.articleCount })
        : t('admin.deleteCategoryDescription', 'Its subcategories move up a level.'),
      confirmText: t('admin.deleteCategoryAction', 'Delete category'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      // 204: resolves with no body, so map success to `true` (`run` resolves `undefined` on failure).
      () => $fetch(helpCenterApi.admin.category(category.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.categoryDeleted', 'Deleted {name}', { name }), error: t('admin.categoryDeleteFailed', 'Could not delete the category') },
    )
    return done === true
  }

  function menu(category: StaffHelpCategory, options: HelpCategoryMenuOptions): DropdownMenuItem[][] {
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        if (await edit(category, options.categories())) await options.onChanged?.()
      },
    }]
    if (category.articleCount > 1) {
      edits.push({
        label: t('admin.orderArticles', 'Order articles'),
        icon: 'i-lucide-arrow-up-down',
        onSelect: async () => {
          if (await reorder(category)) await options.onChanged?.()
        },
      })
    }
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteCategoryAction', 'Delete category'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => {
        if (await remove(category)) await options.onChanged?.()
      },
    }]
    return [edits, destructive]
  }

  return { create, edit, reorder, remove, menu }
}
