<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FormAdminDto, SubmissionSummaryDto } from '../../../types'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const format = useFormat()
const actions = useFormActions()
const id = computed(() => String(route.params.id))
const { data: form } = await useFetch<FormAdminDto>(() => `/api/forms/admin/forms/${id.value}`, { key: `forms:admin:form:${id.value}` })
const { data: submissions, error, status, refresh } = await useFetch<SubmissionSummaryDto[]>(() => `/api/forms/admin/forms/${id.value}/submissions`)

const { sorting, header } = useTableSort({ id: 'createdAt', desc: true })
const columns = computed<TableColumn<SubmissionSummaryDto>[]>(() => [
  { accessorKey: 'createdAt', header: header('createdAt', t('admin.submittedAt', 'Submitted')) },
  { id: 'preview', header: t('admin.answers', 'Answers') },
  { accessorKey: 'deliveryStatus', header: header('deliveryStatus', t('admin.delivery', 'Delivery')) },
  { id: 'actions', header: '', meta: { class: { th: 'w-0', td: 'w-0' } } },
])

const submissionPath = (submission: SubmissionSummaryDto) => paths('adminSubmission', { id: id.value, submissionId: submission.id })
const menu = (submission: SubmissionSummaryDto) => actions.submissionMenu(
  { id: submission.id, formId: id.value },
  { onRedelivered: () => refresh() },
)
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))

const breadcrumb = computed(() => [
  { label: t('admin.title', 'Forms'), to: paths('admin') },
  { label: form.value?.name ?? id.value, to: paths('adminForm', { id: id.value }) },
  { label: t('admin.submissionsTitle', 'Submissions') },
])
</script>

<template>
  <div class="flex flex-col gap-4">
    <PageHeading
      :title="t('admin.submissionsTitle', 'Submissions')"
      :breadcrumb="breadcrumb"
    />

    <UEmpty
      v-if="error && !submissions"
      :icon="forbidden ? 'i-lucide-lock' : 'i-lucide-circle-alert'"
      :title="forbidden ? t('admin.forbidden', 'You are not allowed to manage forms.') : t('admin.submissionsLoadFailed', 'Submissions could not be loaded')"
      :description="forbidden ? undefined : errorMessage(error, '')"
      :actions="forbidden ? undefined : [{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />

    <TableCard
      v-else
      :loading="status === 'pending' && !submissions"
      :refreshing="status === 'pending' && !!submissions"
    >
      <UTable
        v-model:sorting="sorting"
        :data="submissions ?? []"
        :columns="columns"
        :ui="tableUi()"
        @select="(_: Event, row: { original: SubmissionSummaryDto }) => navigateTo(submissionPath(row.original))"
      >
        <template #createdAt-cell="{ row }">
          <span class="tabular-nums">{{ format.dateTime(row.original.createdAt) }}</span>
        </template>
        <template #preview-cell="{ row }">
          <p class="max-w-md truncate">
            <span
              v-for="(answer, index) in row.original.preview"
              :key="answer.label"
            >
              <span
                v-if="index"
                class="text-muted"
              > · </span>{{ answer.value }}
            </span>
          </p>
        </template>
        <template #deliveryStatus-cell="{ row }">
          <StatusBadge
            :status="row.original.deliveryStatus"
            :label="t(`delivery.${row.original.deliveryStatus}`, row.original.deliveryStatus)"
          />
        </template>
        <template #actions-cell="{ row }">
          <RowMenu
            :items="menu(row.original)"
            :subject="format.dateTime(row.original.createdAt)"
          />
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-lucide-inbox"
            :title="t('admin.noSubmissions', 'No submissions yet.')"
            :description="t('admin.noSubmissionsHint', 'Answers appear here once someone submits the form.')"
          />
        </template>
      </UTable>
    </TableCard>
  </div>
</template>
