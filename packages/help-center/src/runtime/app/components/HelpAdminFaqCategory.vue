<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffHelpArticle, StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { computed, h, resolveComponent, tableUi, useFetch, useFormat, useHelpArticleActions, useHelpCategoryActions, useHelpCenterTranslate, useModuleT } from '#imports'

defineOptions({ name: 'HelpAdminFaqCategory' })

// One FAQ category on the FAQ page: its questions (every article, drafts included) in the order readers see them, with
// "Add question" and the category's own menu (Edit, Order questions, Delete). The same routes and slideovers as the
// help center page.
const props = defineProps<{ category: StaffHelpCategory, categories: StaffHelpCategory[] }>()
const emit = defineEmits<{ changed: [] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const format = useFormat()
const articleActions = useHelpArticleActions()
const categoryActions = useHelpCategoryActions()

const { data, status, refresh } = await useFetch<StaffHelpArticle[]>(() => helpCenterApi.admin.categoryArticles(props.category.id), {
  query: { kind: 'faq' },
  key: `help-center:admin:faq:${props.category.id}`,
  default: () => [],
})
const loading = computed(() => status.value === 'pending' && !data.value?.length)

const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')

async function changed() {
  await refresh()
  emit('changed')
}

const columns = computed<TableColumn<StaffHelpArticle>[]>(() => [
  {
    id: 'title',
    header: t('admin.faq.question', 'Question'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.title), description: row.original.slug }),
  },
  {
    id: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: row.original.status === 'published' ? t('admin.statusPublished', 'Published') : t('admin.statusDraft', 'Draft') }),
  },
  {
    id: 'updatedAt',
    header: t('admin.updatedAt', 'Updated'),
    cell: ({ row }) => h('span', { class: 'text-muted tabular-nums' }, row.original.updatedAt ? format.date(row.original.updatedAt) : '–'),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => row.original.readOnly
      ? null
      : h(RowMenu, { items: articleActions.menu(row.original, { categories: () => props.categories, onChanged: changed }), subject: tr(row.original.title) }),
  },
])

const display = computed(() => props.category.display === 'cards'
  ? t('admin.displays.cards', 'Question cards (FAQ)')
  : t('admin.displays.accordion', 'Questions (FAQ)'))

async function addQuestion() {
  if (await articleActions.create(props.categories, props.category.id)) await changed()
}
</script>

<template>
  <TableCard
    :title="tr(category.name)"
    :description="`${category.slug} · ${display}`"
    :loading="loading"
    :data-test="`help-admin-faq-${category.slug}`"
  >
    <template #actions>
      <UButton
        icon="i-lucide-plus"
        variant="outline"
        color="neutral"
        :label="t('admin.faq.addQuestion', 'Add question')"
        @click="addQuestion"
      />
      <RowMenu
        :items="categoryActions.menu({ ...category, articleCount: data?.length ?? category.articleCount }, { categories: () => categories, onChanged: changed })"
        :subject="tr(category.name)"
      />
    </template>
    <UTable
      :data="data ?? []"
      :columns="columns"
      :ui="tableUi()"
    >
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-lucide-message-circle-question-mark"
          :title="t('admin.faq.questionsEmpty', 'No questions yet')"
          :actions="[{ label: t('admin.faq.addQuestion', 'Add question'), icon: 'i-lucide-plus', onClick: addQuestion }]"
        />
      </template>
    </UTable>
  </TableCard>
</template>
