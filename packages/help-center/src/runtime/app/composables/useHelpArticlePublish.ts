import type { StaffHelpArticle } from '../utils/admin'
import type { MissingTranslations } from '../../../types'
import { helpCenterApi } from '../../utils/api'
import { missingTranslations } from '../../utils/publish'
import { $fetch, ref, useErrorToast, useHelpCenterTranslate, useModuleT, useRuntimeConfig, useToast } from '#imports'

/**
 * Publishing an article, shared by the article menu and the edit slideover: `publish(article)` resolves with the published
 * article, or `false` after a toast. A refused publish (`409 missing_translations`) names each field and its missing
 * languages from `data.missing`. `missing(article)` and `describe(missing)` say the same before trying.
 */
export function useHelpArticlePublish() {
  const t = useModuleT('helpCenter')
  const tr = useHelpCenterTranslate()
  const toast = useToast()
  const showError = useErrorToast()
  const requiredLocales: readonly string[] = useRuntimeConfig().public.helpCenter?.requiredLocales ?? ['da', 'en']
  const busy = ref(false)

  const fieldLabel = (field: MissingTranslations[number]['field']) => field === 'title' ? t('admin.articleTitle', 'Title') : t('admin.body', 'Article')

  /** "Title (en); Article (da, en)": the fields and their missing languages. */
  const describe = (missing: MissingTranslations) => missing.map(entry => `${fieldLabel(entry.field)} (${entry.locales.join(', ')})`).join('; ')

  /** What the article still lacks to be published, by the required languages of the site. */
  const missing = (article: Pick<StaffHelpArticle, 'title' | 'body'>) => missingTranslations(article, requiredLocales)

  async function publish(article: StaffHelpArticle): Promise<StaffHelpArticle | false> {
    busy.value = true
    try {
      const published = await $fetch<StaffHelpArticle>(helpCenterApi.admin.publish(article.id), { method: 'POST' })
      toast.add({ title: t('admin.published', 'Published {name}', { name: tr(published.title ?? article.title) }), color: 'success', icon: 'i-lucide-check' })
      return published
    }
    catch (error) {
      const data = (error as { data?: { data?: { code?: string, missing?: MissingTranslations } } }).data?.data
      if (data?.code === 'missing_translations' && data.missing?.length) {
        toast.add({
          title: t('admin.publishFailed', 'Could not publish the article'),
          description: t('admin.publishMissing', 'Still missing: {fields}', { fields: describe(data.missing) }),
          color: 'error',
          icon: 'i-lucide-circle-alert',
        })
      }
      else {
        showError(error, t('admin.publishFailed', 'Could not publish the article'))
      }
      return false
    }
    finally {
      busy.value = false
    }
  }

  return { busy, missing, describe, publish }
}
