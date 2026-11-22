<script setup lang="ts">
import type { HelpArticleSummaryDto, HelpCategoryDto } from '../../../types'
import { computed, errorMessage, useHelpCenterArticles, useHelpCenterCategories, useHelpCenterChecklists, useHelpCenterPaths, useHelpCenterSearch, useHelpCenterTranslate, useModuleT, useSeoMeta } from '#imports'

defineOptions({ name: 'HelpCenterHome' })

// The start page of either area. The public area shows the categories with public articles, the same for every visitor
// (so it can be cached); the signed-in area adds the viewer's onboarding checklists and what changed recently. A search
// box finds articles in any language. The mobile Help tab renders it as well.
const props = defineProps<{ area: 'public' | 'signedIn' }>()

const isPublic = props.area === 'public'
const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const paths = useHelpCenterPaths()
const links = isPublic ? paths.public : paths.signedIn

const { categories, status: categoriesStatus, error: categoriesError, refresh: refreshCategories } = await useHelpCenterCategories({ public: isPublic })
const { articles } = await useHelpCenterArticles(undefined, { public: isPublic })
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
const topLevel = computed<HelpCategoryDto[]>(() => {
  const ids = new Set(categories.value.map(category => category.id))
  return categories.value.filter(category => !category.parentId || !ids.has(category.parentId))
})

// "Recently updated for you": the signed-in area lists what changed lately among the articles the viewer may read.
const recent = computed<HelpArticleSummaryDto[]>(() => isPublic
  ? []
  : [...articles.value].filter(article => article.updatedAt).sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!)).slice(0, 5))

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
              :to="links.article(result.categorySlug, result.slug)"
              class="border-default hover:bg-elevated flex flex-col rounded-md border px-4 py-3"
            >
              <span class="text-highlighted text-sm font-medium">{{ tr(result.title) }}</span>
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
          v-else-if="!topLevel.length"
          variant="naked"
          icon="i-lucide-life-buoy"
          :title="t('empty', 'Nothing here yet')"
          :description="t('emptyDescription', 'Articles will show up here once they are published.')"
        />
        <UPageGrid
          v-else
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
