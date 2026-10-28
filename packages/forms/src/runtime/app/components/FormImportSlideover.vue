<script setup lang="ts">
import { z } from 'zod'
import type { FormImportResult } from '../composables/useFormActions'

// Opened by `useFormActions().importJson()` through `useOverlay()`; closes with what was imported, or `false` when cancelled.
const emit = defineEmits<{
  close: [value: FormImportResult | false]
}>()

const t = useModuleT('forms')
const { busy, run } = useAction()

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

const state = reactive({ text: '' })
const schema = z.object({
  text: z.string().trim()
    .min(1, t('admin.importEmpty', 'Paste the JSON to import.'))
    .refine(text => parse(text) !== undefined, t('admin.invalidJson', 'The JSON is not valid.')),
})

async function save() {
  const parsed = parse(state.text)
  const result = await run(() => $fetch<FormImportResult>('/api/forms/admin/import', {
    method: 'POST',
    body: { forms: Array.isArray(parsed) ? parsed : [parsed] },
  }))
  if (result) emit('close', result)
}
</script>

<template>
  <FormSlideover
    form-id="forms-import"
    :title="t('admin.import', 'Import JSON')"
    :description="t('admin.importHint', 'Paste one form or a list of forms (each with slug, name and definition). Forms whose slug already exists are skipped.')"
    :submit-label="t('admin.importSubmit', 'Import forms')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="forms-import"
      :state="state"
      :schema="schema"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="text"
        :label="t('admin.importLabel', 'Forms as JSON')"
      >
        <UTextarea
          v-model="state.text"
          :rows="16"
          class="w-full font-mono text-xs"
          autofocus
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
