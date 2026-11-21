<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffFaqGroup, StaffFaqGroupsPage } from '../utils/admin-faq'
import { faqApi } from '../../utils/api'
import { computed, emptyCell, errorMessage, h, navigateTo, resolveComponent, tableUi, useFaqGroupActions, useFaqLinks, useFaqTranslate, useFetch, useFormat, useModuleT, useTableQuery, useTableSort } from '#imports'

defineOptions({ name: 'FaqAdminPage' })

const t = useModuleT('faq')
const tr = useFaqTranslate()
const links = useFaqLinks()
const format = useFormat()
const actions = useFaqGroupActions()

// Paginated on the server; page, search (title in every language, URL name) and sort live in the URL. Groups come in the
// order pages and the site list them: by their `sort`.
const { page, pageSize, search, sort: sortState, query, filtered, reset } = useTableQuery({
  sort: { id: 'sort', desc: false },
})
const { sorting, header } = useTableSort(null, sortState)

const { data, status, error, refresh } = await useFetch<StaffFaqGroupsPage>(faqApi.admin.groups, { query })

const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
// The previous page stays on screen (dimmed) while the next one loads; skeletons only on the very first load.
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')

const grantsLabel = (group: StaffFaqGroup) => group.public
  ? t('admin.grantsPublic', 'Public')
  : group.grants.length ? t('admin.grantsRestricted', 'Restricted') : t('admin.grantsNobody', 'Nobody yet')

const columns = computed<TableColumn<StaffFaqGroup>[]>(() => [
  {
    id: 'title',
    accessorFn: row => tr(row.title),
    header: t('admin.groupTitle', 'Title'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.title), description: row.original.slug }),
  },
  {
    id: 'items',
    header: t('admin.items', 'Questions'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, t('admin.itemCounts', '{published} of {total} published', { published: row.original.publishedCount, total: row.original.itemCount })),
  },
  {
    id: 'grants',
    header: t('admin.grantsLabel', 'Who can see it'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, grantsLabel(row.original)),
  },
  {
    id: 'owner',
    header: t('admin.owner', 'Owner'),
    cell: ({ row }) => row.original.owner.type === 'platform'
      ? emptyCell()
      : h('span', { class: 'text-muted' }, `${t(`admin.ownerTypes.${row.original.owner.type}`, row.original.owner.type)}: ${row.original.owner.id}`),
  },
  {
    accessorKey: 'createdAt',
    header: header('createdAt', t('admin.createdAt', 'Created')),
    cell: ({ row }) => h('span', { class: 'text-muted tabular-nums' }, format.date(row.original.createdAt)),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onRemoved: refresh, onChanged: refresh }), subject: tr(row.original.title) }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'FAQ')"
      :description="t('admin.listDescription', 'Questions and answers, grouped, shown on pages and in the app.')"
    >
      <template #actions>
        <UButton
          v-if="!forbidden"
          icon="i-lucide-plus"
          :label="t('admin.createGroup', 'Add FAQ group')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to the FAQ') : t('admin.loadFailed', 'The FAQ groups could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('admin.search', 'Search FAQ groups')"
          :aria-label="t('admin.search', 'Search FAQ groups')"
          class="w-full sm:max-w-xs"
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
        :loading="loading"
        :refreshing="refreshing"
      >
        <UTable
          v-model:sorting="sorting"
          :data="rows"
          :columns="columns"
          :sorting-options="{ manualSorting: true }"
          :ui="tableUi()"
          @select="(_: Event, row: { original: StaffFaqGroup }) => navigateTo(links.adminGroup(row.original.id))"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No FAQ groups match your search')"
              :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-message-circle-question-mark"
              :title="t('admin.empty', 'No FAQ groups yet')"
              :description="t('admin.emptyDescription', 'Add a group, such as membership or volunteering, and fill it with questions.')"
              :actions="[{ label: t('admin.createGroup', 'Add FAQ group'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
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
    </template>
  </div>
</template>
