<script setup lang="ts">
import type { SubmissionDto } from '../../../types'
import { formsApi, isAnswerField, resolveVisibility, translate } from '../../utils'
import { computed, useFormsLocale, useModuleT } from '#imports'

const props = defineProps<{ submission: SubmissionDto }>()

const t = useModuleT('forms')
const locale = useFormsLocale()

// Rendered from the definition the answers were given against, not the form's current one.
const sections = computed(() => resolveVisibility(props.submission.definition, props.submission.answers).map(({ step, fields }) => ({
  id: step.id,
  title: translate(step.title, locale.value),
  rows: fields.filter(isAnswerField).map((field) => {
    const value = props.submission.answers[field.key]
    const option = (v: string) => translate(field.options?.find(o => o.value === v)?.label, locale.value) || v
    return {
      key: field.key,
      label: translate(field.label, locale.value) || field.key,
      type: field.type,
      value: field.type === 'checkbox'
        ? (value ? t('value.yes', 'Yes') : t('value.no', 'No'))
        : (field.type === 'select' || field.type === 'radio') && typeof value === 'string'
            ? option(value)
            : value === undefined || value === null || value === '' ? '' : String(value),
      files: props.submission.files.filter(file => file.fieldKey === field.key),
    }
  }),
})))

const fileUrl = (fileId: string) => formsApi.admin.submissionFile(props.submission.id, fileId)
</script>

<template>
  <div class="space-y-6">
    <section
      v-for="section in sections"
      :key="section.id"
      class="space-y-3"
    >
      <h3
        v-if="section.title"
        class="font-semibold"
      >
        {{ section.title }}
      </h3>
      <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <template
          v-for="row in section.rows"
          :key="row.key"
        >
          <dt class="text-sm text-muted">
            {{ row.label }}
          </dt>
          <dd class="whitespace-pre-wrap break-words">
            <template v-if="row.type === 'file'">
              <ul
                v-if="row.files.length"
                class="space-y-1"
              >
                <li
                  v-for="file in row.files"
                  :key="file.id"
                >
                  <a
                    :href="fileUrl(file.id)"
                    class="underline"
                    download
                  >{{ file.filename }}</a>
                </li>
              </ul>
              <span
                v-else
                class="text-muted"
              >-</span>
            </template>
            <template v-else>
              {{ row.value || '-' }}
            </template>
          </dd>
        </template>
      </dl>
    </section>
  </div>
</template>
