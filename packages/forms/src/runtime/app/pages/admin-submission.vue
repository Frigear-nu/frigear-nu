<script setup lang="ts">
import type { FormAdminDto, SubmissionDto } from '../../../types'
import { formsApi } from '../../utils'
import { computed, errorMessage, useFetch, useFormActions, useFormat, useFormsPaths, useModuleT, useRoute } from '#imports'

const t = useModuleT('forms')
const route = useRoute()
const paths = useFormsPaths()
const format = useFormat()
const actions = useFormActions()
const id = computed(() => String(route.params.id))
const submissionId = computed(() => String(route.params.submissionId))
const { data: form } = await useFetch<FormAdminDto>(() => formsApi.admin.form(id.value), { key: `forms:admin:form:${id.value}` })
const { data: submission, error, refresh } = await useFetch<SubmissionDto>(() => formsApi.admin.submission(submissionId.value))

const breadcrumb = computed(() => [
  { label: t('admin.title', 'Forms'), to: paths('admin') },
  { label: form.value?.name ?? id.value, to: paths('adminForm', { id: id.value }) },
  { label: t('admin.submissionsTitle', 'Submissions'), to: paths('adminSubmissions', { id: id.value }) },
  { label: `#${submissionId.value}` },
])
const menu = computed(() => actions.submissionMenu(
  { id: submissionId.value, formId: id.value },
  { open: false, onRedelivered: () => refresh() },
))
const forbidden = computed(() => [401, 403].includes(error.value?.statusCode ?? 0))
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
          <StatusBadge
            :status="submission.deliveryStatus"
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
      v-else-if="notFound"
      icon="i-lucide-inbox"
      :title="t('admin.submissionNotFound', 'This submission does not exist.')"
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

    <UEmpty
      v-else-if="forbidden"
      icon="i-lucide-lock"
      :title="t('admin.forbidden', 'You are not allowed to manage forms.')"
    />

    <UEmpty
      v-else
      icon="i-lucide-circle-alert"
      :title="t('admin.submissionLoadFailed', 'The submission could not be loaded')"
      :description="errorMessage(error, '')"
      :actions="[{ label: t('admin.tryAgain', 'Try again'), icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
  </div>
</template>
