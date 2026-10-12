<script setup lang="ts">
import type { SubmissionSummaryDto } from '../../../types'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const id = computed(() => String(route.params.id))
const { data: submissions, error } = await useFetch<SubmissionSummaryDto[]>(() => `/api/forms/admin/forms/${id.value}/submissions`)

const color = { none: 'neutral', pending: 'warning', delivered: 'success', failed: 'error' } as const
const columns = [
  { accessorKey: 'createdAt', header: t('admin.submittedAt', 'Submitted') },
  { id: 'preview', header: t('admin.answers', 'Answers') },
  { accessorKey: 'deliveryStatus', header: t('admin.delivery', 'Delivery') },
]
const format = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <AdminPage>
    <AdminPageHeader
      :title="t('admin.submissionsTitle', 'Submissions')"
      :back-to="paths('adminForm', { id })"
      :back-label="t('admin.edit', 'Edit')"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />
    <AdminTable
      v-else
      :data="submissions ?? []"
      :columns="columns"
      @select="(_: Event, row: { original: SubmissionSummaryDto }) => navigateTo(paths('adminSubmission', { id, submissionId: row.original.id }))"
    >
      <template #createdAt-cell="{ row }">
        <span class="text-muted">{{ format(row.original.createdAt) }}</span>
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
        <UBadge
          :color="color[row.original.deliveryStatus]"
          variant="subtle"
          :label="t(`delivery.${row.original.deliveryStatus}`, row.original.deliveryStatus)"
        />
      </template>
      <template #empty>
        <AdminEmpty
          icon="i-lucide-inbox"
          :title="t('admin.noSubmissions', 'No submissions yet.')"
        />
      </template>
    </AdminTable>
  </AdminPage>
</template>
