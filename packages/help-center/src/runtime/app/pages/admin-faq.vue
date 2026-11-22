<script setup lang="ts">
import { type StaffHelpCategory, isFaqDisplay } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { computed, errorMessage, useFetch, useHelpCategoryActions, useHelpCenterPaths, useModuleT } from '#imports'

defineOptions({ name: 'HelpCenterAdminFaqPage' })

// The staff FAQ page (`<admin>/faq`, with `pages.admin`): the help-center categories shown as questions (`accordion`
// and `cards`, the FAQs of the site's pages), each with its questions. Questions are help-center articles and FAQ
// categories help-center categories: the same routes, slideovers and actions as the help center page.
const t = useModuleT('helpCenter')
const paths = useHelpCenterPaths()
const categoryActions = useHelpCategoryActions()

const { data: categories, status, error, refresh } = await useFetch<StaffHelpCategory[]>(helpCenterApi.admin.categories, {
  key: 'help-center:admin:categories',
  default: () => [],
})
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)
const loading = computed(() => status.value === 'pending' && !categories.value?.length)
const faqCategories = computed(() => (categories.value ?? []).filter(category => isFaqDisplay(category.display)))

async function createCategory() {
  // A new FAQ category shows as question cards, like the site's pages; the form can change it.
  if (await categoryActions.create(categories.value ?? [], 'cards')) await refresh()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.faq.title', 'FAQ')"
      :description="t('admin.faq.description', 'The questions and answers on the site\'s pages: the help center categories shown as questions.')"
    >
      <template #actions>
        <UButton
          v-if="paths.admin()"
          variant="outline"
          color="neutral"
          icon="i-lucide-life-buoy"
          :to="paths.admin()"
          :label="t('admin.faq.openHelpCenter', 'Open help center')"
        />
        <UButton
          v-if="!forbidden"
          icon="i-lucide-plus"
          :label="t('admin.faq.createCategory', 'Add FAQ category')"
          @click="createCategory"
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
    <TableCard
      v-else-if="loading"
      loading
    />
    <UEmpty
      v-else-if="!faqCategories.length"
      icon="i-lucide-message-circle-question-mark"
      :title="t('admin.faq.empty', 'No FAQ categories yet')"
      :description="t('admin.faq.emptyDescription', 'Add a category shown as questions, then add its questions.')"
      :actions="[{ label: t('admin.faq.createCategory', 'Add FAQ category'), icon: 'i-lucide-plus', onClick: createCategory }]"
    />
    <template v-else>
      <HelpAdminFaqCategory
        v-for="category in faqCategories"
        :key="category.id"
        :category="category"
        :categories="faqCategories"
        @changed="refresh"
      />
    </template>
  </div>
</template>
