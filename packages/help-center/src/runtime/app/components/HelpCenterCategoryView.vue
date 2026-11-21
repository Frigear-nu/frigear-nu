<script setup lang="ts">
import { computed, errorMessage, resolveComponent, setResponseStatus, useRequestEvent, useHelpCenterArticles, useHelpCenterCategories, useHelpCenterPaths, useHelpCenterTranslate, useModuleT, useRuntimeConfig, useSeoMeta } from '#imports'

defineOptions({ name: 'HelpCenterCategoryView' })

// One category: its subcategories, its articles and, when `@frigear-nu/faq` is installed, the FAQ groups the category
// lists. The FAQ component filters by its own grants, so a public FAQ group inside a restricted category is still public
// through the FAQ's own API.
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

// Resolves to a plain string name when faq is not installed: then nothing renders.
const FaqSectionList = resolveComponent('FaqSectionList')
const withFaq = typeof FaqSectionList !== 'string' && !!useRuntimeConfig().public.helpCenter?.faq
const faqGroups = computed(() => withFaq ? current.value?.faqGroups ?? [] : [])

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

      <ul
        v-if="articles.length"
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
        v-else-if="!children.length && !faqGroups.length"
        variant="naked"
        icon="i-lucide-file-text"
        :title="t('category.empty', 'No articles here yet')"
      />

      <div
        v-if="faqGroups.length"
        class="flex flex-col gap-4"
        data-test="help-center-faq"
      >
        <component
          :is="FaqSectionList"
          :groups="faqGroups"
          :public="isPublic"
        />
      </div>
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
