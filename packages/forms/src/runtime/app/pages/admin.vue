<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FormSummaryDto, FormsPage } from '../../../types'
import { formsApi } from '../../utils'
import { FORMS_LIST_KEY, computed, numericColumn, useFetch, useFormActions, useFormat, useFormsPaths, useModuleT, useTableQuery, useTableSort } from '#imports'

const t = useModuleT('forms')
const paths = useFormsPaths()
const format = useFormat()
const actions = useFormActions()

// Search, status filter, sort and page live in the URL and go to the API (`all`, the default, is left out).
const list = useTableQuery({ sort: { id: 'updatedAt', desc: true }, filters: { status: 'all' } })
const { page, pageSize, search, filters, filtered } = list
const { data, error, status, refresh } = await useFetch<FormsPage<FormSummaryDto>>(formsApi.admin.forms, { key: FORMS_LIST_KEY, query: list.query })
const forms = computed(() => data.value?.items ?? [])

const statusItems = computed(() => [
  { value: 'all', label: t('admin.allStatuses', 'All statuses') },
  ...(['published', 'draft', 'archived'] as const).map(value => ({ value, label: t(`status.${value}`, value) })),
])
const clearFilters = () => list.reset()

const { sorting, header } = useTableSort(null, list.sort)
const columns = computed<TableColumn<FormSummaryDto>[]>(() => [
  { accessorKey: 'name', header: header('name', t('admin.name', 'Name')) },
  { accessorKey: 'status', header: header('status', t('admin.status', 'Status')) },
  { accessorKey: 'submissionCount', header: header('submissionCount', t('admin.submissionsTitle', 'Submissions')), meta: numericColumn },
  { accessorKey: 'updatedAt', header: header('updatedAt', t('admin.updated', 'Updated')) },
  { id: 'actions', header: '', meta: { class: { th: 'w-0', td: 'w-0' } } },
])
const formDescription = (form: FormSummaryDto) => [
  `/${form.slug}`,
  form.mode === 'stepped' ? t('admin.stepped', 'Stepped') : t('admin.single', 'Single page'),
  `v${form.version}`,
  ...(form.storage === 'none' ? [t('admin.notStored', 'Not stored')] : []),
].join(' · ')

// 401/403 means "not allowed" (no retry will help); anything else is a failed request.
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))

const editPath = (form: FormSummaryDto) => paths('adminForm', { id: form.id })
const menu = (form: FormSummaryDto) => actions.menu(form)
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading :title="t('admin.title', 'Forms')">
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          :label="t('admin.import', 'Import JSON')"
          @click="actions.importJson()"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.new', 'New form')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error && !data"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You are not allowed to manage forms.') : t('admin.loadFailed', 'Forms could not be loaded')"
      :description="forbidden ? undefined : errorMessage(error, '')"
      :actions="forbidden ? undefined : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <template v-else>
      <PageToolbar>
        <UInput
          v-model="search"
          class="w-full sm:w-72"
          icon="i-lucide-search"
          :placeholder="t('admin.search', 'Search forms')"
          :aria-label="t('admin.search', 'Search forms')"
        />
        <USelect
          v-model="filters.status"
          class="w-full sm:w-44"
          :items="statusItems"
          :aria-label="t('admin.statusFilter', 'Filter by status')"
        />
      </PageToolbar>

      <TableCard
        :loading="status === 'pending' && !data"
        :refreshing="status === 'pending' && !!data"
      >
        <UTable
          v-model:sorting="sorting"
          :data="forms"
          :columns="columns"
          :sorting-options="{ manualSorting: true }"
          :ui="tableUi()"
          @select="(_: Event, row: { original: FormSummaryDto }) => navigateTo(editPath(row.original))"
        >
          <template #name-cell="{ row }">
            <TableIdentity
              :title="row.original.name"
              :description="formDescription(row.original)"
            />
          </template>
          <template #status-cell="{ row }">
            <StatusBadge
              :status="row.original.status"
              :label="t(`status.${row.original.status}`, row.original.status)"
              :colors="{ archived: 'warning' }"
            />
          </template>
          <template #updatedAt-cell="{ row }">
            <span class="tabular-nums">{{ format.date(row.original.updatedAt) }}</span>
          </template>
          <template #actions-cell="{ row }">
            <RowMenu
              :items="menu(row.original)"
              :subject="row.original.name"
            />
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-lucide-clipboard-list"
              :title="filtered ? t('admin.noMatches', 'No forms match.') : t('admin.empty', 'No forms yet')"
              :description="filtered ? undefined : t('admin.emptyDescription', 'Create a form to start collecting answers.')"
            >
              <template #actions>
                <UButton
                  v-if="filtered"
                  color="neutral"
                  variant="outline"
                  :label="t('admin.clearFilters', 'Clear filters')"
                  @click="clearFilters"
                />
                <UButton
                  v-else
                  icon="i-lucide-plus"
                  :label="t('admin.new', 'New form')"
                  @click="actions.create()"
                />
              </template>
            </UEmpty>
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
