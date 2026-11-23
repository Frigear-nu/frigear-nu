import type { DropdownMenuItem } from '@nuxt/ui'
import HelpCategoryFormSlideover from '../components/HelpCategoryFormSlideover.vue'
import HelpCategoryOrderSlideover from '../components/HelpCategoryOrderSlideover.vue'
import type { StaffHelpCategory } from '../utils/admin'
import type { AdminHelpCategoryKindChangeDto, HelpCategoryKind } from '../../../types'
import { helpCenterApi } from '../../utils/api'
import { $fetch, useAction, useConfirmDialog, useHelpCenterTranslate, useModuleT, useOverlay } from '#imports'

export type HelpCategoryMenuOptions = {
  /** The categories, for the parent picker of the form: only those of the page's kind. */
  categories: () => StaffHelpCategory[]
  /** Runs after the category was edited or deleted (refresh the list). */
  onChanged?: () => unknown
}

/**
 * What staff can do with a category: `create` and `edit` (a slideover; each resolves with the saved category, or `false`
 * when cancelled), `reorder` (a slideover that saves each move; resolves with whether the order changed), `remove`
 * (confirms first, and says what is affected), `changeKind` (to the other kind, with its subcategories and articles;
 * confirms first, with what moves and the checklist entries a change to FAQ removes) and `menu(category)`: Edit, Order
 * articles, Change to FAQ / help category | Delete.
 */
export function useHelpCategoryActions() {
  const t = useModuleT('helpCenter')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const tr = useHelpCenterTranslate()

  /** `kind` is the kind of the new category (`faq` from the FAQ page, which also starts it at `cards`); fixed once saved. */
  async function create(categories: StaffHelpCategory[], kind: HelpCategoryKind = 'help'): Promise<StaffHelpCategory | false> {
    return await overlay.create(HelpCategoryFormSlideover, { destroyOnClose: true, props: { category: undefined, categories, kind } }).open() as StaffHelpCategory | false
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
      () => $fetch(helpCenterApi.admin.category(category.id), { method: 'DELETE', query: { kind: category.kind } }).then(() => true),
      { success: t('admin.categoryDeleted', 'Deleted {name}', { name }), error: t('admin.categoryDeleteFailed', 'Could not delete the category') },
    )
    return done === true
  }

  /** Changes the category to the other kind: it leaves this admin page for the other one. Resolves with whether it changed. */
  async function changeKind(category: StaffHelpCategory): Promise<boolean> {
    const name = tr(category.name)
    const impact = await run(
      () => $fetch<AdminHelpCategoryKindChangeDto>(helpCenterApi.admin.categoryKindChange(category.id), { query: { kind: category.kind } }),
      { error: t('admin.changeKindFailed', 'Could not change the kind of the category') },
    )
    if (!impact) return false
    const toFaq = impact.kind === 'faq'
    const lines = [
      toFaq
        ? t('admin.changeKindToFaq', 'It moves to the FAQ admin, with {categories} categories and {articles} articles. Its articles become questions without pages of their own; their old links lead to the FAQ.', { categories: impact.categoryCount, articles: impact.articleCount })
        : t('admin.changeKindToHelp', 'It moves to the help center, with {categories} categories and {articles} articles. Its questions become articles with pages of their own; their old links lead there.', { categories: impact.categoryCount, articles: impact.articleCount }),
    ]
    if (impact.leavesParent) lines.push(t('admin.changeKindLeavesParent', 'It leaves its parent category and moves to the top level.'))
    if (toFaq && impact.checklistItemCount) lines.push(t('admin.changeKindChecklist', '{count} onboarding checklist entries are removed: an FAQ question is never on a checklist.', { count: impact.checklistItemCount }))
    const action = toFaq ? t('admin.changeToFaq', 'Change to FAQ') : t('admin.changeToHelp', 'Change to help category')
    const confirmed = await confirm({
      title: toFaq ? t('admin.changeKindToFaqTitle', 'Change {name} to an FAQ?', { name }) : t('admin.changeKindToHelpTitle', 'Change {name} to a help category?', { name }),
      description: lines.join(' '),
      confirmText: action,
      destructive: toFaq && impact.checklistItemCount > 0,
    })
    if (!confirmed) return false
    const saved = await run(
      () => $fetch<StaffHelpCategory>(helpCenterApi.admin.category(category.id), { method: 'PATCH', query: { kind: category.kind }, body: { kind: impact.kind } }),
      {
        success: toFaq ? t('admin.changedToFaq', 'Moved {name} to the FAQ', { name }) : t('admin.changedToHelp', 'Moved {name} to the help center', { name }),
        error: t('admin.changeKindFailed', 'Could not change the kind of the category'),
      },
    )
    return Boolean(saved)
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
    edits.push({
      label: category.kind === 'faq' ? t('admin.changeToHelp', 'Change to help category') : t('admin.changeToFaq', 'Change to FAQ'),
      icon: category.kind === 'faq' ? 'i-lucide-life-buoy' : 'i-lucide-message-circle-question-mark',
      onSelect: async () => {
        if (await changeKind(category)) await options.onChanged?.()
      },
    })
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

  return { create, edit, reorder, remove, changeKind, menu }
}
