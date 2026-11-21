<script setup lang="ts">
import type { StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { computed, errorMessage, ref, useFetch, useHelpArticleActions, useModuleT, useRoute, useRouter, watch } from '#imports'

defineOptions({ name: 'HelpCenterAdminPage' })

// The staff page of the help center (opt-in with `pages.admin`): articles, categories and onboarding checklists in
// tabs, the tab kept in the URL (`?tab=`). The category list is fetched here because the article tab needs it too.
const t = useModuleT('helpCenter')
const route = useRoute()
const router = useRouter()
const articleActions = useHelpArticleActions()

const TABS = ['articles', 'categories', 'checklists'] as const
type Tab = (typeof TABS)[number]
const read = (): Tab => TABS.find(tab => tab === route.query.tab) ?? 'articles'
const tab = ref<Tab>(read())
watch(tab, (value) => {
  router.replace({ query: { ...route.query, tab: value === 'articles' ? undefined : value } })
})

const { data: categories, status, error, refresh } = await useFetch<StaffHelpCategory[]>(helpCenterApi.admin.categories, {
  key: 'help-center:admin:categories',
  default: () => [],
})
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const loading = computed(() => status.value === 'pending' && !categories.value?.length)

const tabs = computed(() => [
  { label: t('admin.articles', 'Articles'), icon: 'i-lucide-file-text', value: 'articles' },
  { label: t('admin.categories', 'Categories'), icon: 'i-lucide-folder-open', value: 'categories' },
  { label: t('admin.checklists', 'Onboarding checklists'), icon: 'i-lucide-list-checks', value: 'checklists' },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Help center')"
      :description="t('admin.listDescription', 'Articles in categories, onboarding checklists and who has read what.')"
    >
      <template #actions>
        <UButton
          v-if="!forbidden"
          variant="outline"
          color="neutral"
          icon="i-lucide-mail"
          :label="t('admin.sendTitle', 'Send articles')"
          @click="articleActions.send()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !categories?.length"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to the help center') : t('admin.loadFailed', 'The help center could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageTabs
        v-model="tab"
        :items="tabs"
      />
      <HelpAdminArticles
        v-if="tab === 'articles'"
        :categories="categories ?? []"
      />
      <HelpAdminCategories
        v-else-if="tab === 'categories'"
        :categories="categories ?? []"
        :loading="loading"
        @changed="refresh"
      />
      <HelpAdminChecklists v-else />
    </template>
  </div>
</template>
