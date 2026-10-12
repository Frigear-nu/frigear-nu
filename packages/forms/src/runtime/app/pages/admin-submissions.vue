<script setup lang="ts">
import type { SubmissionSummaryDto } from '../../../types'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const id = computed(() => String(route.params.id))
const { data: submissions, error } = await useFetch<SubmissionSummaryDto[]>(() => `/api/forms/admin/forms/${id.value}/submissions`)

const color = { none: 'neutral', pending: 'warning', delivered: 'success', failed: 'error' } as const
const format = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <div class="space-y-6">
    <AdminPageHeader
      :title="t('admin.submissionsTitle', 'Submissions')"
      :back="{ label: t('admin.edit', 'Edit'), to: paths('adminForm', { id }) }"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />
    <UEmpty
      v-else-if="!submissions?.length"
      icon="i-lucide-inbox"
      :title="t('admin.noSubmissions', 'No submissions yet.')"
    />

    <div
      v-else
      class="divide-y divide-default rounded-lg border border-default"
    >
      <NuxtLink
        v-for="submission in submissions"
        :key="submission.id"
        :to="paths('adminSubmission', { id, submissionId: submission.id })"
        class="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-elevated"
      >
        <div class="min-w-0 space-y-1">
          <p class="text-sm text-muted">
            {{ format(submission.createdAt) }}
          </p>
          <p class="truncate">
            <span
              v-for="(answer, index) in submission.preview"
              :key="answer.label"
            >
              <span
                v-if="index"
                class="text-muted"
              > · </span>{{ answer.value }}
            </span>
          </p>
        </div>
        <UBadge
          :color="color[submission.deliveryStatus]"
          variant="subtle"
          :label="t(`delivery.${submission.deliveryStatus}`, submission.deliveryStatus)"
        />
      </NuxtLink>
    </div>
  </div>
</template>
