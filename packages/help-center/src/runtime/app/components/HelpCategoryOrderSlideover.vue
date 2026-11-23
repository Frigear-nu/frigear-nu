<script setup lang="ts">
import type { StaffHelpArticle, StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { errorMessage, ref, useFetch, useHelpCenterTranslate, useModuleT } from '#imports'

defineOptions({ name: 'HelpCategoryOrderSlideover' })

// The order of a category's articles, opened with `useOverlay()` by `useHelpCategoryActions()`. Every move is saved at
// once; it closes with `true` when the order changed, `false` otherwise.
const props = defineProps<{ category: StaffHelpCategory }>()
const emit = defineEmits<{ close: [changed: boolean] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const changed = ref(false)

const { data, status, error, refresh } = useFetch<StaffHelpArticle[]>(helpCenterApi.admin.categoryArticles(props.category.id), {
  query: { kind: props.category.kind },
  key: `help-center:admin:category-articles:${props.category.id}`,
  default: () => [],
})

function close() {
  emit('close', changed.value)
}
</script>

<template>
  <USlideover
    :title="t('admin.orderArticlesTitle', 'Order of {name}', { name: tr(category.name) })"
    :description="t('admin.orderArticlesDescription', 'Readers see the articles in this order. Each move is saved at once.')"
    :ui="{ footer: 'justify-end gap-2' }"
    @update:open="(open: boolean) => { if (!open) close() }"
  >
    <template #body>
      <div
        v-if="status === 'pending' && !data?.length"
        class="flex flex-col gap-2"
      >
        <USkeleton
          v-for="n in 4"
          :key="n"
          class="h-12"
        />
      </div>
      <UEmpty
        v-else-if="error"
        icon="i-lucide-circle-alert"
        :title="t('admin.orderLoadFailed', 'The articles could not be loaded')"
        :description="errorMessage(error, '')"
        :actions="[{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
      />
      <UEmpty
        v-else-if="!data?.length"
        variant="naked"
        icon="i-lucide-file-text"
        :title="t('category.empty', 'No articles here yet')"
      />
      <HelpCategoryArticleOrder
        v-else
        :category="category"
        :articles="data"
        @changed="changed = true"
      />
    </template>
    <template #footer>
      <UButton
        :label="t('admin.orderDone', 'Done')"
        @click="close"
      />
    </template>
  </USlideover>
</template>
