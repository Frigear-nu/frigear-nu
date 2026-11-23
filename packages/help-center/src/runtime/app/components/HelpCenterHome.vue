<script setup lang="ts">
import type { HelpArticleSummaryDto, HelpCategoryDto } from '../../../types'
import { computed, errorMessage, navigateTo, nextTick, onMounted, useHelpCenterArticles, useHelpCenterCategories, useHelpCenterChecklists, useHelpCenterFaqs, useHelpCenterPaths, useHelpCenterSearch, useHelpCenterTranslate, useModuleT, useRoute, useSeoMeta, watch } from '#imports'

defineOptions({ name: 'HelpCenterHome' })

// The start page of either area. The public area shows the categories with public articles, the same for every visitor
// (so it can be cached); the signed-in area adds the viewer's onboarding checklists and what changed recently. A search
// box finds articles in any language. The mobile Help tab renders it as well.
// FAQ categories (kind `faq`, the questions embedded on the site's pages) are not help categories: they are left out of
// the category grid and shown in an FAQ section of their own below it, as questions that open in place. A search finds
// them too, labelled FAQ, and links to their place in that section (`?faq=<slug>#faq-<category>`): they have no page.
const props = defineProps<{ area: 'public' | 'signedIn' }>()

const isPublic = props.area === 'public'
const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const paths = useHelpCenterPaths()
const links = isPublic ? paths.public : paths.signedIn

const { categories, status: categoriesStatus, error: categoriesError, refresh: refreshCategories } = await useHelpCenterCategories({ public: isPublic })
const { articles } = await useHelpCenterArticles(undefined, { public: isPublic })
// Every `faq` category the viewer may read, with its questions' text.
const { faqs } = await useHelpCenterFaqs(undefined, { public: isPublic })
const faqSections = computed(() => faqs.value.filter(faq => faq.articles.length))
// The checklists belong to the person, so only the signed-in area asks for them.
const checklists = isPublic ? computed(() => []) : (await useHelpCenterChecklists()).checklists
const { q, results, status: searching } = useHelpCenterSearch({ public: isPublic })
const searched = computed(() => q.value.trim().length >= 2)

useSeoMeta({ title: () => t('title', 'Help center') })

const counts = computed(() => {
  const map = new Map<string, number>()
  for (const article of articles.value) map.set(article.categorySlug, (map.get(article.categorySlug) ?? 0) + 1)
  return map
})
// Top-level categories: those without a parent, or whose parent the viewer cannot read.
const helpCategories = computed(() => categories.value.filter(category => category.kind !== 'faq'))
const topLevel = computed<HelpCategoryDto[]>(() => {
  const ids = new Set(helpCategories.value.map(category => category.id))
  return helpCategories.value.filter(category => !category.parentId || !ids.has(category.parentId))
})

// "Recently updated for you": the signed-in area lists what changed lately among the articles the viewer may read.
const recent = computed<HelpArticleSummaryDto[]>(() => isPublic
  ? []
  : [...articles.value].filter(article => article.kind !== 'faq' && article.updatedAt).sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!)).slice(0, 5))

// The question a link opened (`?faq=<slug>`): open in the FAQ section, which is scrolled to it.
const route = useRoute()
const openFaq = computed(() => typeof route.query.faq === 'string' ? route.query.faq : undefined)
// Links follow a category's current kind: an FAQ link to a question or category that is now in the help center goes to
// its page (a 301 for a question; a category's `#faq-<category>` never reaches the server, so the browser moves on).
const movedArticle = openFaq.value ? articles.value.find(article => article.slug === openFaq.value && article.kind !== 'faq') : undefined
const movedArticleHome = movedArticle ? links.article(movedArticle.categorySlug, movedArticle.slug) : undefined
if (movedArticleHome) await navigateTo(movedArticleHome, { replace: true, redirectCode: 301 })
function movedCategoryHome(): string | undefined {
  if (!route.hash.startsWith('#faq-') || openFaq.value) return undefined
  const slug = decodeURIComponent(route.hash.slice('#faq-'.length))
  return helpCategories.value.some(category => category.slug === slug) ? links.category(slug) : undefined
}
const resultLink = (result: HelpArticleSummaryDto) => result.kind === 'faq'
  ? links.faq(result.categorySlug, result.slug)
  : links.article(result.categorySlug, result.slug)

async function scrollToFaq() {
  if (!import.meta.client || !route.hash.startsWith('#faq-')) return
  const moved = movedCategoryHome()
  if (moved) return navigateTo(moved, { replace: true })
  await nextTick()
  const target = openFaq.value ? document.getElementById(`faq-q-${openFaq.value}`) : null
  ;(target ?? document.getElementById(decodeURIComponent(route.hash.slice(1))))?.scrollIntoView({ block: 'start' })
}
onMounted(scrollToFaq)
// A result on this page: the search closes so the FAQ section shows, then it scrolls to the question.
watch(() => route.fullPath, async () => {
  if (!route.hash.startsWith('#faq-')) return
  q.value = ''
  await scrollToFaq()
})

const categoryName = (article: HelpArticleSummaryDto) => {
  const category = categories.value.find(entry => entry.slug === article.categorySlug)
  return category ? tr(category.name) : ''
}
</script>

<template>
  <HelpCenterFrame
    :area="area"
    :title="t('title', 'Help center')"
    :description="isPublic ? t('descriptionPublic', 'Answers and guides for everyone.') : t('descriptionSignedIn', 'Guides, onboarding and answers for you.')"
  >
    <template
      v-if="isPublic"
      #links
    >
      <HelpCenterSignedInCta />
    </template>

    <div class="flex flex-col gap-6">
      <UInput
        v-model="q"
        icon="i-lucide-search"
        size="lg"
        :loading="searching === 'pending'"
        :placeholder="t('search', 'Search the help center')"
        :aria-label="t('search', 'Search the help center')"
        class="w-full"
        data-test="help-center-search"
      />

      <template v-if="searched">
        <UEmpty
          v-if="searching !== 'pending' && !results.length"
          variant="naked"
          icon="i-lucide-search"
          :title="t('noResults', 'Nothing matches your search')"
        />
        <ul
          v-else
          class="flex flex-col gap-2"
          data-test="help-center-results"
        >
          <li
            v-for="result in results"
            :key="result.id"
          >
            <NuxtLink
              :to="resultLink(result)"
              class="border-default hover:bg-elevated flex flex-col rounded-md border px-4 py-3"
              :data-kind="result.kind"
            >
              <span class="flex items-center gap-2">
                <span class="text-highlighted text-sm font-medium">{{ tr(result.title) }}</span>
                <UBadge
                  v-if="result.kind === 'faq'"
                  :label="t('faqLabel', 'FAQ')"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  data-test="help-center-result-faq"
                />
              </span>
              <span class="text-muted text-xs">{{ categoryName(result) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </template>

      <template v-else>
        <HelpCenterChecklistCard
          v-for="checklist in checklists"
          :key="checklist.id"
          :checklist="checklist"
        />

        <template v-if="categoriesStatus === 'pending' && !topLevel.length">
          <USkeleton class="h-32" />
        </template>
        <UEmpty
          v-else-if="categoriesError && !topLevel.length"
          icon="i-lucide-circle-alert"
          :title="t('loadFailed', 'The help center could not be loaded')"
          :description="errorMessage(categoriesError, '')"
          :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refreshCategories() }]"
        />
        <UEmpty
          v-else-if="!topLevel.length && !faqSections.length"
          variant="naked"
          icon="i-lucide-life-buoy"
          :title="t('empty', 'Nothing here yet')"
          :description="t('emptyDescription', 'Articles will show up here once they are published.')"
        />
        <UPageGrid
          v-else-if="topLevel.length"
          data-test="help-center-categories"
        >
          <UPageCard
            v-for="category in topLevel"
            :key="category.id"
            :title="tr(category.name)"
            :description="category.description ? tr(category.description) : undefined"
            :to="links.category(category.slug)"
            icon="i-lucide-folder-open"
          >
            <template #footer>
              <span class="text-muted text-xs">{{ t('articleCount', '{count} articles', { count: counts.get(category.slug) ?? 0 }) }}</span>
            </template>
          </UPageCard>
        </UPageGrid>

        <section
          v-if="faqSections.length"
          class="flex flex-col gap-4"
          data-test="help-center-faq"
        >
          <h2 class="text-highlighted text-xl font-semibold">
            {{ t('faqTitle', 'Frequently asked questions') }}
          </h2>
          <div
            v-for="faq in faqSections"
            :id="`faq-${faq.slug}`"
            :key="faq.id"
            class="flex scroll-mt-24 flex-col gap-3"
          >
            <div class="flex flex-col gap-1">
              <h3 class="text-highlighted text-base font-semibold">
                {{ tr(faq.name) }}
              </h3>
              <p
                v-if="faq.description"
                class="text-muted text-sm"
              >
                {{ tr(faq.description) }}
              </p>
            </div>
            <HelpCenterAccordion
              :articles="faq.articles"
              :public="isPublic"
              :open="openFaq"
            />
          </div>
        </section>

        <SectionCard
          v-if="recent.length"
          :title="t('recent', 'Recently updated for you')"
          icon="i-lucide-clock"
          flush
        >
          <ul class="divide-default flex flex-col divide-y">
            <li
              v-for="article in recent"
              :key="article.id"
            >
              <NuxtLink
                :to="links.article(article.categorySlug, article.slug)"
                class="hover:bg-elevated flex flex-col px-4 py-3"
              >
                <span class="text-default text-sm font-medium">{{ tr(article.title) }}</span>
                <span class="text-muted text-xs">{{ categoryName(article) }}</span>
              </NuxtLink>
            </li>
          </ul>
        </SectionCard>
      </template>
    </div>
  </HelpCenterFrame>
</template>
