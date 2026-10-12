<script setup lang="ts">
import type { SubmissionDto } from '../../../types'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const toast = useToast()
const id = computed(() => String(route.params.id))
const submissionId = computed(() => String(route.params.submissionId))
const { data: submission, error, refresh } = await useFetch<SubmissionDto>(() => `/api/forms/admin/submissions/${submissionId.value}`)

const redelivering = ref(false)
async function redeliver() {
  redelivering.value = true
  try {
    await $fetch(`/api/forms/admin/submissions/${submissionId.value}/redeliver`, { method: 'POST' })
    await refresh()
  }
  catch (cause) {
    toast.add({ title: (cause as { statusMessage?: string }).statusMessage ?? t('error.generic', 'Something went wrong. Please try again.'), color: 'error' })
  }
  finally {
    redelivering.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="error || !submission"
      color="error"
      variant="subtle"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />

    <template v-else>
      <AdminPageHeader
        :title="new Date(submission.createdAt).toLocaleString()"
        :description="`${submission.formSlug} · v${submission.formVersion} · ${submission.locale}`"
        :back="{ label: t('admin.submissionsTitle', 'Submissions'), to: paths('adminSubmissions', { id }) }"
      />

      <UAlert
        :color="submission.deliveryStatus === 'failed' ? 'error' : 'neutral'"
        variant="subtle"
        :title="t(`delivery.${submission.deliveryStatus}`, submission.deliveryStatus)"
        :description="submission.deliveryError ?? undefined"
        :actions="[{ label: t('admin.redeliver', 'Deliver again'), loading: redelivering, onClick: redeliver }]"
      />

      <FormSubmissionView :submission="submission" />
    </template>
  </div>
</template>
