<script setup lang="ts">
import { useHelpCenterFaqCards } from '../composables/useHelpCenterFaqCards'
import { computed, errorMessage, setResponseStatus, useRequestEvent, useHelpCenterArticles, useHelpCenterCategories, useHelpCenterPaths, useHelpCenterTranslate, useModuleT, useSeoMeta } from '#imports'

defineOptions({ name: 'HelpCenterCategoryView' })

// One category: its subcategories and its articles. A `list` category links to each article's page; an `accordion`
// category shows each article as a question whose text opens in place and, in the public area, adds the public ones to
// the page's `FAQPage` JSON-LD.
const props = defineProps<{ area: 'public' | 'signedIn', category: string }>()

const isPublic = props.area === 'public'
const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const paths = useHelpCenterPaths()
const links = isPublic ? paths.public : paths.signedIn

const { categories, error: categoriesError, refresh: refreshCategories } = await useHelpCenterCategories({ public: isPublic })
const { articles, error: articlesError, refresh: refreshArticles } = await useHelpCenterArticles(() => props.category, { public: isPublic })
const error = computed(() => categoriesError.value ?? articlesError.value)
const refresh = () => Promise.all([refreshCategories(), refreshArticles()])

const current = computed(() => categories.value.find(category => category.slug === props.category))
const children = computed(() => current.value ? categories.value.filter(category => category.parentId === current.value!.id) : [])
const parent = computed(() => current.value?.parentId ? categories.value.find(category => category.id === current.value!.parentId) : undefined)

// An accordion needs the articles' text: fetched only for an accordion category, with the JSON-LD in the public area.
const accordion = computed(() => current.value?.display === 'accordion')
const { faqs, loading: faqsLoading } = useHelpCenterFaqCards(() => ({ categories: accordion.value ? [props.category] : undefined, public: isPublic }), { jsonLd: isPublic })
const accordionArticles = computed(() => faqs.value[0]?.articles ?? [])

const breadcrumb = computed(() => [
  { label: t('title', 'Help center'), to: links.index() },
  ...(parent.value ? [{ label: tr(parent.value.name), to: links.category(parent.value.slug) }] : []),
  { label: current.value ? tr(current.value.name) : props.category },
])

// Not found is a 404 for crawlers too; a failed request is an error, not "not found".
if (import.meta.server && !current.value && !error.value) setResponseStatus(useRequestEvent(), 404)

useSeoMeta({ title: () => current.value ? tr(current.value.name) : t('title', 'Help center') })
</script>

<template>
  <HelpCenterFrame
    v-if="current"
    :area="area"
    :title="tr(current.name)"
    :description="current.description ? tr(current.description) : undefined"
    :breadcrumb="breadcrumb"
  >
    <div class="flex flex-col gap-6">
      <UPageGrid
        v-if="children.length"
        data-test="help-center-subcategories"
      >
        <UPageCard
          v-for="child in children"
          :key="child.id"
          :title="tr(child.name)"
          :description="child.description ? tr(child.description) : undefined"
          :to="links.category(child.slug)"
          icon="i-lucide-folder-open"
        />
      </UPageGrid>

      <template v-if="accordion && articles.length">
        <div
          v-if="faqsLoading"
          class="flex flex-col gap-2"
        >
          <USkeleton
            v-for="n in Math.min(articles.length, 4)"
            :key="n"
            class="h-10"
          />
        </div>
        <HelpCenterAccordion
          v-else
          :articles="accordionArticles"
          :public="isPublic"
        />
      </template>
      <ul
        v-else-if="articles.length"
        class="flex flex-col gap-2"
        data-test="help-center-articles"
      >
        <li
          v-for="article in articles"
          :key="article.id"
        >
          <NuxtLink
            :to="links.article(article.categorySlug, article.slug)"
            class="border-default hover:bg-elevated flex items-center gap-3 rounded-md border px-4 py-3"
          >
            <UIcon
              name="i-lucide-file-text"
              class="text-muted size-4 shrink-0"
            />
            <span class="text-highlighted text-sm font-medium">{{ tr(article.title) }}</span>
          </NuxtLink>
        </li>
      </ul>
      <UEmpty
        v-else-if="!children.length"
        variant="naked"
        icon="i-lucide-file-text"
        :title="t('category.empty', 'No articles here yet')"
      />
    </div>
  </HelpCenterFrame>
  <HelpCenterFrame
    v-else-if="error"
    :area="area"
    :title="t('category.loadFailed', 'The category could not be loaded')"
  >
    <UEmpty
      icon="i-lucide-circle-alert"
      :title="t('category.loadFailed', 'The category could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </HelpCenterFrame>
  <HelpCenterFrame
    v-else
    :area="area"
    :title="t('category.notFound', 'Category not found')"
  >
    <UEmpty
      icon="i-lucide-folder-search"
      :title="t('category.notFound', 'Category not found')"
      :description="t('category.notFoundDescription', 'It does not exist, or you may not read it.')"
      :actions="[{ label: t('title', 'Help center'), to: links.index(), color: 'neutral', variant: 'outline' }]"
    />
  </HelpCenterFrame>
</template>
