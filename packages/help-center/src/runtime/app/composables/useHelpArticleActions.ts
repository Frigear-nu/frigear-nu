import type { DropdownMenuItem } from '@nuxt/ui'
import HelpArticleFormSlideover from '../components/HelpArticleFormSlideover.vue'
import HelpSendSlideover from '../components/HelpSendSlideover.vue'
import type { StaffHelpArticle, StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { $fetch, useAction, useConfirmDialog, useHelpCenterTranslate, useModuleT, useOverlay } from '#imports'

export type HelpArticleMenuOptions = {
  /** The categories, for the category picker of the form. */
  categories: () => StaffHelpCategory[]
  /** Runs after the article was changed, deleted, published or unpublished (refresh the list). */
  onChanged?: () => unknown
  /** Show "Send" (needs `help-center:send`). */
  send?: boolean
}

/**
 * What staff can do with articles: `create` and `edit` (a slideover), `publish`, `unpublish`, `remove` (confirms
 * first), `send` and `menu(article, options)`: Edit | Publish or Unpublish, Send | Delete. Each resolves with the
 * result, or `false` when cancelled or refused (a failed publish shows the missing languages in a toast). An article of a
 * read-only source (Nuxt Content) gets no menu.
 */
export function useHelpArticleActions() {
  const t = useModuleT('helpCenter')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const tr = useHelpCenterTranslate()

  async function create(categories: StaffHelpCategory[], categoryId?: string): Promise<StaffHelpArticle | false> {
    return await overlay.create(HelpArticleFormSlideover, { destroyOnClose: true, props: { article: undefined, categories, categoryId } }).open() as StaffHelpArticle | false
  }

  async function edit(article: StaffHelpArticle, categories: StaffHelpCategory[]): Promise<StaffHelpArticle | false> {
    return await overlay.create(HelpArticleFormSlideover, { destroyOnClose: true, props: { article, categories } }).open() as StaffHelpArticle | false
  }

  async function publish(article: StaffHelpArticle): Promise<StaffHelpArticle | false> {
    const published = await run(
      () => $fetch<StaffHelpArticle>(helpCenterApi.admin.publish(article.id), { method: 'POST' }),
      { success: t('admin.published', 'Published {name}', { name: tr(article.title) }), error: t('admin.publishFailed', 'Could not publish the article') },
    )
    return published ?? false
  }

  async function unpublish(article: StaffHelpArticle): Promise<StaffHelpArticle | false> {
    const draft = await run(
      () => $fetch<StaffHelpArticle>(helpCenterApi.admin.unpublish(article.id), { method: 'POST' }),
      { success: t('admin.unpublished', 'Unpublished {name}', { name: tr(article.title) }), error: t('admin.unpublishFailed', 'Could not unpublish the article') },
    )
    return draft ?? false
  }

  async function remove(article: StaffHelpArticle): Promise<boolean> {
    const name = tr(article.title)
    const confirmed = await confirm({
      title: t('admin.deleteArticleTitle', 'Delete {name}?', { name }),
      description: t('admin.deleteArticleDescription', 'It disappears from every page, checklist and search, and the record of who read it goes with it.'),
      confirmText: t('admin.deleteArticleAction', 'Delete article'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(helpCenterApi.admin.article(article.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.articleDeleted', 'Deleted {name}', { name }), error: t('admin.articleDeleteFailed', 'Could not delete the article') },
    )
    return done === true
  }

  /** Opens the send form with these articles picked. Resolves with the result, or `false` when cancelled. */
  async function send(articleIds: string[] = []) {
    return await overlay.create(HelpSendSlideover, { destroyOnClose: true, props: { articleIds } }).open() as Awaited<ReturnType<typeof $fetch>> | false
  }

  function menu(article: StaffHelpArticle, options: HelpArticleMenuOptions): DropdownMenuItem[][] {
    if (article.readOnly) return []
    const changed = async (ok: unknown) => {
      if (ok) await options.onChanged?.()
    }
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => changed(await edit(article, options.categories())),
    }]
    const state: DropdownMenuItem[] = [article.status === 'published'
      ? { label: t('admin.unpublish', 'Unpublish'), icon: 'i-lucide-eye-off', onSelect: async () => changed(await unpublish(article)) }
      : { label: t('admin.publish', 'Publish'), icon: 'i-lucide-send', onSelect: async () => changed(await publish(article)) }]
    if (options.send && article.status === 'published') {
      state.push({
        label: t('admin.sendArticle', 'Send to people'),
        icon: 'i-lucide-mail',
        onSelect: async () => {
          await send([article.id])
        },
      })
    }
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteArticleAction', 'Delete article'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => changed(await remove(article)),
    }]
    return [edits, state, destructive]
  }

  return { create, edit, publish, unpublish, remove, send, menu }
}
