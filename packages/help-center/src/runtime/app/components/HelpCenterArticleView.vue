<script setup lang="ts">
import { helpCenterApi } from '../../utils/api'
import { stripMarkdown } from '../../utils/markdown'
import { $fetch, clearNuxtData, computed, errorMessage, navigateTo, onMounted, setResponseStatus, useRequestEvent, useHead, useHelpCenterArticle, useHelpCenterFallbackLocale, useHelpCenterLocale, useHelpCenterPaths, useHelpCenterTranslate, useModuleT, useRuntimeConfig, useSeoMeta, useUserSession } from '#imports'

defineOptions({ name: 'HelpCenterArticleView' })

// One article. In the public area it is what every visitor reads (with `Article` JSON-LD for search engines and a link
// into the signed-in area for people who are signed in); in the signed-in area it is the viewer's version. A signed-in
// reader marks it as read, so the checklists tick it off.
const props = defineProps<{ area: 'public' | 'signedIn', category: string, slug: string }>()

const isPublic = props.area === 'public'
const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const locale = useHelpCenterLocale()
const fallback = useHelpCenterFallbackLocale()
const paths = useHelpCenterPaths()
const links = isPublic ? paths.public : paths.signedIn
const config = useRuntimeConfig().public.helpCenter
const { loggedIn } = useUserSession()

const { article, error, refresh } = await useHelpCenterArticle(() => props.slug, { public: isPublic })

// Not found is a 404 for crawlers too; a failed request is an error, not "not found".
if (import.meta.server && !article.value && !error.value) setResponseStatus(useRequestEvent(), 404)

// An FAQ question has no page: it goes to its place in the FAQ section of the start page.
const faqHome = article.value?.kind === 'faq' ? links.faq(article.value.categorySlug, article.value.slug) : undefined
if (faqHome) await navigateTo(faqHome, { replace: true, redirectCode: 301 })

// The address of an article is `<base>/<its category>/<slug>`: another category in the URL goes to the real one.
else if (article.value && article.value.categorySlug !== props.category) {
  const canonical = links.article(article.value.categorySlug, article.value.slug)
  if (canonical) await navigateTo(canonical, { replace: true, redirectCode: 301 })
}

const title = computed(() => article.value ? tr(article.value.title) : '')
const body = computed(() => article.value ? tr(article.value.body) : '')

useSeoMeta({
  title: () => title.value || t('title', 'Help center'),
  description: () => body.value ? stripMarkdown(body.value).slice(0, 160) : undefined,
})

// Search engines get the articles anyone can read, as plain text, never the signed-in version.
useHead({
  script: computed(() => {
    if (!isPublic || config?.schema === false || !article.value?.public) return []
    const text = stripMarkdown(body.value)
    if (!title.value || !text) return []
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': title.value,
      'articleBody': text,
      'inLanguage': locale.value || fallback.value,
      ...(article.value.updatedAt ? { dateModified: article.value.updatedAt } : {}),
      ...(article.value.publishedAt ? { datePublished: article.value.publishedAt } : {}),
    }
    return [{ key: 'help-center-jsonld', type: 'application/ld+json', innerHTML: JSON.stringify(data).replace(/</g, '\\u003c') }]
  }),
})

const breadcrumb = computed(() => [
  { label: t('title', 'Help center'), to: links.index() },
  ...(article.value?.category ? [{ label: tr(article.value.category.name), to: links.category(article.value.category.slug) }] : []),
  { label: title.value },
])

// Reading is recorded on the client, by someone who is signed in (also from the public area): the page stays the same
// for every visitor. The checklists refetch when they are next shown.
onMounted(async () => {
  if (!loggedIn.value || !article.value) return
  try {
    await $fetch(helpCenterApi.me.reads, { method: 'POST', body: { articleId: article.value.id } })
    clearNuxtData(key => key.startsWith('help-center:checklists:'))
  }
  catch {
    // Reading an article never fails because it could not be recorded.
  }
})
</script>

<template>
  <HelpCenterFrame
    v-if="article"
    :area="area"
    :title="title"
    :breadcrumb="breadcrumb"
  >
    <div class="flex max-w-3xl flex-col gap-8">
      <!-- A failed refresh (offline): what was loaded stays, with a quiet note. -->
      <StaleDataNotice
        :error="error"
        :refresh="refresh"
      />
      <HelpCenterArticleBody
        :body="body"
        :public="isPublic"
      />
      <div
        v-if="isPublic"
        class="border-default flex border-t pt-4"
      >
        <HelpCenterSignedInCta
          :to="paths.signedIn.article(article.categorySlug, article.slug)"
          variant="link"
          :label="t('cta.article', 'Open in the crew help center')"
        />
      </div>
    </div>
  </HelpCenterFrame>
  <HelpCenterFrame
    v-else-if="error"
    :area="area"
    :title="t('article.loadFailed', 'The article could not be loaded')"
  >
    <UEmpty
      icon="i-lucide-circle-alert"
      :title="t('article.loadFailed', 'The article could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </HelpCenterFrame>
  <HelpCenterFrame
    v-else
    :area="area"
    :title="t('article.notFound', 'Article not found')"
  >
    <UEmpty
      icon="i-lucide-file-search"
      :title="t('article.notFound', 'Article not found')"
      :description="t('article.notFoundDescription', 'It does not exist, or you may not read it.')"
      :actions="[{ label: t('title', 'Help center'), to: links.index(), color: 'neutral', variant: 'outline' }]"
    />
  </HelpCenterFrame>
</template>
