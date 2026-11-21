<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffHelpArticle, StaffHelpArticlesPage, StaffHelpCategory } from '../utils/admin'
import { helpCenterApi } from '../../utils/api'
import { computed, h, resolveComponent, tableUi, useFetch, useFormat, useHelpArticleActions, useHelpCenterTranslate, useModuleT, useTableQuery, useTableSort } from '#imports'

defineOptions({ name: 'HelpAdminArticles' })

// The articles tab of the admin page: every article of every source (database articles can be edited, Nuxt Content ones
// are read-only), paginated on the server. Page, search, filters and sort live in the URL.
const props = defineProps<{ categories: StaffHelpCategory[] }>()

const t = useModuleT('helpCenter')
const tr = useHelpCenterTranslate()
const format = useFormat()
const actions = useHelpArticleActions()

const { page, pageSize, search, sort: sortState, filters, query, filtered, reset } = useTableQuery({
  sort: { id: 'updatedAt', desc: true },
  filters: { status: 'all', category: 'all', source: 'all' },
})
const { sorting, header } = useTableSort(null, sortState)

const { data, status, refresh } = await useFetch<StaffHelpArticlesPage>(helpCenterApi.admin.articles, { query, key: 'help-center:admin:articles' })
const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)

const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')
const StatusBadge = resolveComponent('StatusBadge')
const UBadge = resolveComponent('UBadge')

const visibilityLabel = (article: StaffHelpArticle) => article.visibility?.public
  ? t('admin.visibility.public', 'Public')
  : article.visibility ? t('admin.visibilityRestricted', 'Restricted') : t('admin.visibilityInherited', 'Same as the category')

const categoryName = (slug: string) => {
  const category = props.categories.find(entry => entry.slug === slug)
  return category ? tr(category.name) : slug
}

const columns = computed<TableColumn<StaffHelpArticle>[]>(() => [
  {
    id: 'title',
    accessorFn: row => tr(row.title),
    header: header('title', t('admin.articleTitle', 'Title')),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.title), description: row.original.slug }),
  },
  {
    id: 'category',
    header: t('admin.category', 'Category'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, categoryName(row.original.categorySlug)),
  },
  {
    id: 'status',
    header: t('admin.status', 'Status'),
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h(StatusBadge, { status: row.original.status, label: row.original.status === 'published' ? t('admin.statusPublished', 'Published') : t('admin.statusDraft', 'Draft') }),
      row.original.source !== 'database'
        ? h(UBadge, { variant: 'outline', color: 'neutral', label: t('admin.sourceBadge', 'Source: {source}', { source: row.original.source }) })
        : null,
    ]),
  },
  {
    id: 'visibility',
    header: t('admin.visibilityLabel', 'Who can see it'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, visibilityLabel(row.original)),
  },
  {
    accessorKey: 'updatedAt',
    header: header('updatedAt', t('admin.updatedAt', 'Updated')),
    cell: ({ row }) => h('span', { class: 'text-muted tabular-nums' }, row.original.updatedAt ? format.date(row.original.updatedAt) : '–'),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => row.original.readOnly
      ? null
      : h(RowMenu, { items: actions.menu(row.original, { categories: () => props.categories, onChanged: refresh, send: true }), subject: tr(row.original.title) }),
  },
])

const statusItems = computed(() => [
  { value: 'all', label: t('admin.allStatuses', 'Every status') },
  { value: 'published', label: t('admin.statusPublished', 'Published') },
  { value: 'draft', label: t('admin.statusDraft', 'Draft') },
])
const categoryItems = computed(() => [
  { value: 'all', label: t('admin.allCategories', 'Every category') },
  ...props.categories.map(category => ({ value: category.slug, label: tr(category.name) })),
])
const sourceItems = computed(() => [
  { value: 'all', label: t('admin.allSources', 'Every source') },
  { value: 'database', label: t('admin.sourceDatabase', 'Database') },
  { value: 'content', label: t('admin.sourceContent', 'Nuxt Content') },
])

async function create() {
  if (await actions.create(props.categories)) await refresh()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageToolbar>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        :loading="pending"
        :placeholder="t('admin.searchArticles', 'Search articles')"
        :aria-label="t('admin.searchArticles', 'Search articles')"
        class="w-full sm:max-w-xs"
      />
      <USelect
        v-model="filters.status"
        :items="statusItems"
        class="w-full sm:w-40"
      />
      <USelect
        v-model="filters.category"
        :items="categoryItems"
        class="w-full sm:w-48"
      />
      <USelect
        v-model="filters.source"
        :items="sourceItems"
        class="w-full sm:w-40"
      />
      <UButton
        v-if="filtered"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        :label="t('admin.clearFilters', 'Clear filters')"
        @click="reset"
      />
    </PageToolbar>

    <TableCard
      :title="t('admin.articles', 'Articles')"
      :loading="loading"
      :refreshing="refreshing"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.createArticle', 'Add article')"
          :disabled="!categories.length"
          @click="create"
        />
      </template>
      <UTable
        v-model:sorting="sorting"
        :data="rows"
        :columns="columns"
        :sorting-options="{ manualSorting: true }"
        :ui="tableUi()"
        data-test="help-admin-articles"
      >
        <template #empty>
          <UEmpty
            v-if="filtered"
            variant="naked"
            icon="i-lucide-search"
            :title="t('admin.noArticleMatches', 'No articles match your search')"
            :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
          />
          <UEmpty
            v-else
            variant="naked"
            icon="i-lucide-file-text"
            :title="t('admin.articlesEmpty', 'No articles yet')"
            :description="categories.length ? t('admin.articlesEmptyDescription', 'Write the first article. It starts as a draft.') : t('admin.articlesNeedCategory', 'Add a category first, then file articles in it.')"
            :actions="categories.length ? [{ label: t('admin.createArticle', 'Add article'), icon: 'i-lucide-plus', onClick: create }] : []"
          />
        </template>
      </UTable>
      <template #footer>
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="data?.total ?? 0"
        />
      </template>
    </TableCard>
  </div>
</template>
