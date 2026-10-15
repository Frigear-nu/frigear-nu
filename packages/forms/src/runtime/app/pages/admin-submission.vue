<script setup lang="ts">
import type { FormAdminDto, SubmissionDto } from '../../../types'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const format = useFormat()
const actions = useFormActions()
const id = computed(() => String(route.params.id))
const submissionId = computed(() => String(route.params.submissionId))
const { data: form } = await useFetch<FormAdminDto>(() => `/api/forms/admin/forms/${id.value}`, { key: `forms:admin:form:${id.value}` })
const { data: submission, error, refresh } = await useFetch<SubmissionDto>(() => `/api/forms/admin/submissions/${submissionId.value}`)

async function redeliver() {
  if (await actions.redeliver(submissionId.value)) await refresh()
}

const breadcrumb = computed(() => [
  { label: t('admin.title', 'Forms'), to: paths('admin') },
  { label: form.value?.name ?? id.value, to: paths('adminForm', { id: id.value }) },
  { label: t('admin.submissionsTitle', 'Submissions'), to: paths('adminSubmissions', { id: id.value }) },
  { label: `#${submissionId.value}` },
])
const menu = computed(() => [[{
  label: t('admin.redeliver', 'Deliver again'),
  icon: 'i-lucide-send',
  onSelect: redeliver,
}]])
const notFound = computed(() => error.value?.statusCode === 404)
</script>

<template>
  <div class="flex flex-col gap-4">
    <template v-if="submission">
      <PageHeading
        :title="format.dateTime(submission.createdAt)"
        :description="`${submission.formSlug} · v${submission.formVersion} · ${submission.locale}`"
        :breadcrumb="breadcrumb"
      >
        <template #badge>
          <UBadge
            :color="statusColor(submission.deliveryStatus)"
            variant="subtle"
            :label="t(`delivery.${submission.deliveryStatus}`, submission.deliveryStatus)"
          />
        </template>
        <template #actions>
          <RowMenu
            :items="menu"
            :subject="format.dateTime(submission.createdAt)"
            variant="outline"
          />
        </template>
      </PageHeading>

      <UAlert
        v-if="submission.deliveryError"
        color="error"
        variant="subtle"
        :title="t(`delivery.${submission.deliveryStatus}`, submission.deliveryStatus)"
        :description="submission.deliveryError"
      />

      <SectionCard :title="t('admin.answers', 'Answers')">
        <FormSubmissionView :submission="submission" />
      </SectionCard>
    </template>

    <UEmpty
      v-else
      :icon="notFound ? 'i-lucide-inbox' : 'i-lucide-lock'"
      :title="notFound ? t('admin.submissionNotFound', 'This submission does not exist.') : t('admin.forbidden', 'You are not allowed to manage forms.')"
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-arrow-left"
          :to="paths('adminSubmissions', { id })"
          :label="t('admin.submissionsTitle', 'Submissions')"
        />
      </template>
    </UEmpty>
  </div>
</template>
