<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { StaffOperationSummary, StaffOperationsPage } from '../utils/admin-operation'
import { OPERATION_STATUSES, OPERATION_STATUS_LABELS } from '../../utils/status'
import { operationsApi } from '../../utils/api'
import { computed, emptyCell, errorMessage, h, navigateTo, resolveComponent, tableUi, useFetch, useFormat, useModuleT, useOperationActions, useOperationLinks, useOperationsTranslate, useTableQuery, useTableSort } from '#imports'

defineOptions({ name: 'OperationsAdminPage' })

const t = useModuleT('operations')
const tr = useOperationsTranslate()
const format = useFormat()
const links = useOperationLinks()
const actions = useOperationActions()

// Paginated on the server; page, search (name in every language, URL name), status and sort live in the URL.
// `all` stands for no filter (a select cannot hold an empty value).
const { page, pageSize, search, sort: sortState, filters, query, filtered, reset } = useTableQuery({
  sort: { id: 'startsAt', desc: true },
  filters: { status: 'all' },
})
const { sorting, header } = useTableSort(null, sortState)

const { data, status, error, refresh } = await useFetch<StaffOperationsPage>(operationsApi.admin.operations, { query })

const rows = computed(() => data.value?.items ?? [])
const pending = computed(() => status.value === 'pending')
// The previous page stays on screen (dimmed) while the next one loads; skeletons only on the very first load.
const loading = computed(() => pending.value && !data.value)
const refreshing = computed(() => pending.value && !!data.value)
const forbidden = computed(() => error.value?.statusCode === 401 || error.value?.statusCode === 403)

const statusOptions = computed(() => [
  { label: t('admin.allStatuses', 'All statuses'), value: 'all' },
  ...OPERATION_STATUSES.map(value => ({ label: t(`admin.statuses.${value}`, OPERATION_STATUS_LABELS[value]), value })),
])

const StatusBadge = resolveComponent('StatusBadge')
const RowMenu = resolveComponent('RowMenu')
const TableIdentity = resolveComponent('TableIdentity')

const columns = computed<TableColumn<StaffOperationSummary>[]>(() => [
  {
    id: 'name',
    accessorFn: row => tr(row.name),
    header: t('admin.name', 'Name'),
    cell: ({ row }) => h(TableIdentity, { title: tr(row.original.name), description: tr(row.original.location?.name) }),
  },
  {
    accessorKey: 'status',
    header: header('status', t('admin.status', 'Status')),
    cell: ({ row }) => h(StatusBadge, { status: row.original.status, label: t(`admin.statuses.${row.original.status}`, OPERATION_STATUS_LABELS[row.original.status]) }),
  },
  {
    accessorKey: 'startsAt',
    header: header('startsAt', t('admin.starts', 'Starts')),
    cell: ({ row }) => row.original.startsAt ? h('span', { class: 'tabular-nums' }, format.dateTime(row.original.startsAt)) : emptyCell(),
  },
  {
    id: 'visibility',
    header: t('admin.visibility', 'Visibility'),
    cell: ({ row }) => h('span', { class: 'text-muted' }, row.original.public ? t('admin.visibilityPublic', 'Public') : t('admin.visibilityPrivate', 'Participants only')),
  },
  {
    id: 'actions',
    meta: { class: { th: 'w-0', td: 'w-0' } },
    cell: ({ row }) => h(RowMenu, { items: actions.menu(row.original, { onRemoved: refresh, onChanged: refresh }), subject: tr(row.original.name) }),
  },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.title', 'Operations')"
      :description="t('admin.listDescription', 'The occasions your organisation works at, whether or not it hosts them.')"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.create', 'Add operation')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You do not have access to operations') : t('admin.loadFailed', 'Operations could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="forbidden ? [] : [{ label: t('tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :loading="pending"
          :placeholder="t('admin.search', 'Search operations')"
          :aria-label="t('admin.search', 'Search operations')"
          class="w-full sm:max-w-xs"
        />
        <USelect
          v-model="filters.status"
          :items="statusOptions"
          :aria-label="t('admin.status', 'Status')"
          class="w-44"
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
          @select="(_: Event, row: { original: StaffOperationSummary }) => navigateTo(links.adminOperation(row.original.id))"
        >
          <template #empty>
            <UEmpty
              v-if="filtered"
              variant="naked"
              icon="i-lucide-search"
              :title="t('admin.noMatches', 'No operations match your search')"
              :actions="[{ label: t('admin.clearFilters', 'Clear filters'), color: 'neutral', variant: 'outline', onClick: reset }]"
            />
            <UEmpty
              v-else
              variant="naked"
              icon="i-lucide-tent"
              :title="t('admin.empty', 'No operations yet')"
              :description="t('admin.emptyDescription', 'Add the first operation, such as a festival bar, to attach crew and shifts to it.')"
              :actions="[{ label: t('admin.create', 'Add operation'), icon: 'i-lucide-plus', onClick: () => actions.create() }]"
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
