import type { DropdownMenuItem } from '@nuxt/ui'
import HelpArticleFormSlideover from '../components/HelpArticleFormSlideover.vue'
import HelpArticleMoveModal from '../components/HelpArticleMoveModal.vue'
import HelpSendSlideover from '../components/HelpSendSlideover.vue'
import type { StaffHelpArticle, StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { useHelpArticlePublish } from './useHelpArticlePublish'
import { $fetch, useAction, useConfirmDialog, useHelpCenterTranslate, useModuleT, useOverlay } from '#imports'

export type HelpArticleMenuOptions = {
  /** The categories, for the category picker of the form: only those of the page's kind. */
  categories: () => StaffHelpCategory[]
  /** Runs after the article was changed, deleted, published or unpublished (refresh the list). */
  onChanged?: () => unknown
  /** Show "Send" (needs `help-center:send`). */
  send?: boolean
}

/**
 * What staff can do with articles: `create` and `edit` (a slideover), `move` (to a category of the other kind: "Move to
 * FAQ" / "Move to help center"), `publish`, `unpublish`, `remove` (confirms first), `send` and
 * `menu(article, options)`: Edit, Move | Publish or Unpublish, Send | Delete. Each resolves with the
 * result, or `false` when cancelled or refused (a failed publish lists the missing languages in a toast). "Publish" of an
 * article that still lacks a required language names them and opens the edit slideover with those fields marked, where
 * it can be published once complete. An article of a read-only source (Nuxt Content) gets no menu.
 */
export function useHelpArticleActions() {
  const t = useModuleT('helpCenter')
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const tr = useHelpCenterTranslate()
  const publishing = useHelpArticlePublish()

  async function create(categories: StaffHelpCategory[], categoryId?: string): Promise<StaffHelpArticle | false> {
    return await overlay.create(HelpArticleFormSlideover, { destroyOnClose: true, props: { article: undefined, categories, categoryId } }).open() as StaffHelpArticle | false
  }

  /** `highlightMissing` marks the fields that still lack a required language (opened from "Publish"). */
  async function edit(article: StaffHelpArticle, categories: StaffHelpCategory[], options: { highlightMissing?: boolean } = {}): Promise<StaffHelpArticle | false> {
    return await overlay.create(HelpArticleFormSlideover, { destroyOnClose: true, props: { article, categories, highlightMissing: options.highlightMissing } }).open() as StaffHelpArticle | false
  }

  /** Publishes the article; a refused publish (`409 missing_translations`) lists `data.missing` in the toast. */
  const publish = (article: StaffHelpArticle) => publishing.publish(article)

  async function unpublish(article: StaffHelpArticle): Promise<StaffHelpArticle | false> {
    const draft = await run(
      () => $fetch<StaffHelpArticle>(helpCenterApi.admin.unpublish(article.id), { method: 'POST', query: { kind: article.kind } }),
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
      () => $fetch(helpCenterApi.admin.article(article.id), { method: 'DELETE', query: { kind: article.kind } }).then(() => true),
      { success: t('admin.articleDeleted', 'Deleted {name}', { name }), error: t('admin.articleDeleteFailed', 'Could not delete the article') },
    )
    return done === true
  }

  /** Opens the send form with these articles picked. Resolves with the result, or `false` when cancelled. */
  async function send(articleIds: string[] = []) {
    return await overlay.create(HelpSendSlideover, { destroyOnClose: true, props: { articleIds } }).open() as Awaited<ReturnType<typeof $fetch>> | false
  }

  /** Moves the article to a category of the other kind; it then leaves this admin page. */
  async function move(article: StaffHelpArticle): Promise<StaffHelpArticle | false> {
    return await overlay.create(HelpArticleMoveModal, { destroyOnClose: true, props: { article } }).open() as StaffHelpArticle | false
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
    }, {
      label: article.kind === 'faq' ? t('admin.moveToHelp', 'Move to help center') : t('admin.moveToFaq', 'Move to FAQ'),
      icon: article.kind === 'faq' ? 'i-lucide-life-buoy' : 'i-lucide-message-circle-question-mark',
      onSelect: async () => changed(await move(article)),
    }]
    const state: DropdownMenuItem[] = [article.status === 'published'
      ? { label: t('admin.unpublish', 'Unpublish'), icon: 'i-lucide-eye-off', onSelect: async () => changed(await unpublish(article)) }
      : publishItem(article, options)]
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

  // "Publish" stays enabled: an article that still lacks a required language says which in the item, and selecting it
  // opens the edit slideover with those fields marked (it has its own Publish button for when they are filled in).
  function publishItem(article: StaffHelpArticle, options: HelpArticleMenuOptions): DropdownMenuItem {
    const missing = publishing.missing(article)
    return {
      label: t('admin.publish', 'Publish'),
      icon: 'i-lucide-send',
      ...(missing.length ? { description: t('admin.publishMissing', 'Still missing: {fields}', { fields: publishing.describe(missing) }) } : {}),
      onSelect: async () => {
        const done = missing.length
          ? await edit(article, options.categories(), { highlightMissing: true })
          : await publish(article)
        if (done) await options.onChanged?.()
      },
    }
  }

  return { create, edit, move, publish, unpublish, remove, send, menu }
}
