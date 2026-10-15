<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FormStatus, FormSummaryDto } from '../../../types'

const t = useModuleT('forms')
const paths = useFormsPaths()
const format = useFormat()
const actions = useFormActions()
const { data: forms, error, status } = await useFetch<FormSummaryDto[]>('/api/forms/admin/forms', { key: FORMS_LIST_KEY })

const search = ref('')
const statusFilter = ref<FormStatus | 'all'>('all')
const statusItems = computed(() => [
  { value: 'all', label: t('admin.allStatuses', 'All statuses') },
  ...(['published', 'draft', 'archived'] as const).map(value => ({ value, label: t(`status.${value}`, value) })),
])

const visibleForms = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (forms.value ?? []).filter(form =>
    (statusFilter.value === 'all' || form.status === statusFilter.value)
    && (!query || form.name.toLowerCase().includes(query) || form.slug.toLowerCase().includes(query)),
  )
})
const filtered = computed(() => !!search.value.trim() || statusFilter.value !== 'all')
function clearFilters() {
  search.value = ''
  statusFilter.value = 'all'
}

const { sorting, header } = useTableSort({ id: 'updatedAt', desc: true })
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

const editPath = (form: FormSummaryDto) => paths('adminForm', { id: form.id })
const menu = (form: FormSummaryDto) => actions.menu(form, {
  extra: [{ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: editPath(form) }],
})

const importing = ref(false)
const importText = ref('')
const importBusy = ref(false)
async function runImport() {
  importBusy.value = true
  try {
    if (await actions.importJson(importText.value)) {
      importing.value = false
      importText.value = ''
    }
  }
  finally {
    importBusy.value = false
  }
}
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
          @click="importing = true"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('admin.new', 'New form')"
          @click="actions.create()"
        />
      </template>
    </PageHeading>

    <UEmpty
      v-if="error"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
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
          v-model="statusFilter"
          class="w-full sm:w-44"
          :items="statusItems"
          :aria-label="t('admin.statusFilter', 'Filter by status')"
        />
      </PageToolbar>

      <TableCard
        :loading="status === 'pending' && !forms"
        :refreshing="status === 'pending' && !!forms"
      >
        <UTable
          v-model:sorting="sorting"
          :data="visibleForms"
          :columns="columns"
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
            <UBadge
              :color="statusColor(row.original.status, { archived: 'warning' })"
              variant="subtle"
              :label="t(`status.${row.original.status}`, row.original.status)"
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
        <template
          v-if="forms?.length"
          #footer
        >
          <span>{{ t('admin.showing', '{shown} of {total} forms', { shown: visibleForms.length, total: forms.length }) }}</span>
        </template>
      </TableCard>
    </template>

    <UModal
      v-model:open="importing"
      :title="t('admin.import', 'Import JSON')"
      :description="t('admin.importHint', 'Paste one form or a list of forms (each with slug, name and definition). Forms whose slug already exists are skipped.')"
      :ui="{ footer: 'justify-end gap-2' }"
    >
      <template #body>
        <UTextarea
          v-model="importText"
          :rows="12"
          class="w-full font-mono text-xs"
        />
      </template>
      <template #footer>
        <UButton
          color="neutral"
          variant="outline"
          :label="t('admin.cancel', 'Cancel')"
          :disabled="importBusy"
          @click="importing = false"
        />
        <UButton
          :label="t('admin.importSubmit', 'Import forms')"
          :loading="importBusy"
          :disabled="!importText.trim()"
          @click="runImport"
        />
      </template>
    </UModal>
  </div>
</template>
