<script setup lang="ts">
import type { StaffHelpArticle, StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { $fetch, computed, ref, useAction, useFetch, useHelpCenterTranslate, useModuleT, useUiT, watch } from '#imports'

defineOptions({ name: 'HelpArticleMoveModal' })

// Moves an article to a category of the other kind, opened with `useOverlay()` by `useHelpArticleActions().move`: a
// help article becomes an FAQ question (it loses its page and leaves the onboarding checklists), an FAQ question a help
// article. It closes with the moved article, or `false` when cancelled. Moves within a kind are the editor's category
// field.
const props = defineProps<{ article: StaffHelpArticle }>()
const emit = defineEmits<{ close: [moved: StaffHelpArticle | false] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const actions = useUiT('actions')
const { busy, run } = useAction()

const target = props.article.kind === 'faq' ? 'help' : 'faq'
const toFaq = target === 'faq'
// Not awaited: an overlay has no Suspense around it. The first category is picked once they are in.
const { data: categories, status } = useFetch<StaffHelpCategory[]>(helpCenterApi.admin.categories, {
  query: { kind: target },
  key: `help-center:admin:move-categories:${target}`,
  default: () => [],
})
const items = computed(() => (categories.value ?? []).filter(category => category.kind === target).map(category => ({ value: category.id, label: tr(category.name) })))
const categoryId = ref<string | undefined>()
watch(items, (list) => {
  if (!categoryId.value) categoryId.value = list[0]?.value
}, { immediate: true })

async function move() {
  if (!categoryId.value) return
  const title = tr(props.article.title)
  const moved = await run(
    () => $fetch<StaffHelpArticle>(helpCenterApi.admin.article(props.article.id), { method: 'PATCH', query: { kind: props.article.kind }, body: { categoryId: categoryId.value } }),
    {
      success: toFaq ? t('admin.movedToFaq', 'Moved {name} to the FAQ', { name: title }) : t('admin.movedToHelp', 'Moved {name} to the help center', { name: title }),
      error: t('admin.moveFailed', 'Could not move the article'),
    },
  )
  if (moved) emit('close', moved)
}
</script>

<template>
  <UModal
    :title="toFaq ? t('admin.moveToFaqTitle', 'Move {name} to the FAQ', { name: tr(article.title) }) : t('admin.moveToHelpTitle', 'Move {name} to the help center', { name: tr(article.title) })"
    :description="toFaq
      ? t('admin.moveToFaqDescription', 'It becomes a question of an FAQ category, without a page of its own. Its old link leads to the FAQ.')
      : t('admin.moveToHelpDescription', 'It becomes an article of a help category, with a page of its own. Its old link leads there.')"
    :ui="{ footer: 'justify-end' }"
    @update:open="(open: boolean) => !open && emit('close', false)"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField
          :label="toFaq ? t('admin.moveToFaqCategory', 'FAQ category') : t('admin.moveToHelpCategory', 'Help category')"
          required
        >
          <USelect
            v-model="categoryId"
            :items="items"
            :loading="status === 'pending'"
            :placeholder="items.length || status === 'pending' ? undefined : (toFaq ? t('admin.moveNoFaqCategories', 'No FAQ categories yet') : t('admin.moveNoHelpCategories', 'No help categories yet'))"
            :disabled="!items.length"
            class="w-full"
          />
        </UFormField>
        <UAlert
          v-if="toFaq"
          color="warning"
          variant="subtle"
          icon="i-lucide-list-checks"
          :title="t('admin.moveToFaqChecklist', 'It leaves the onboarding checklists')"
          :description="t('admin.moveToFaqChecklistDescription', 'An FAQ question is never on a checklist: every checklist that lists this article loses it.')"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        :label="actions('cancel', 'Cancel')"
        color="neutral"
        variant="outline"
        :disabled="busy"
        @click="emit('close', false)"
      />
      <UButton
        :label="toFaq ? t('admin.moveToFaq', 'Move to FAQ') : t('admin.moveToHelp', 'Move to help center')"
        :icon="toFaq ? 'i-lucide-message-circle-question-mark' : 'i-lucide-life-buoy'"
        :loading="busy"
        :disabled="!categoryId"
        @click="move"
      />
    </template>
  </UModal>
</template>
