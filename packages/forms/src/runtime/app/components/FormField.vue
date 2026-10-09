<script setup lang="ts">
import type { FormField } from '../../../types'
import { renderMarkdown, translate } from '../../utils'

const props = defineProps<{ field: FormField, locale: string }>()
const model = defineModel<unknown>()

const text = (value: FormField['label']) => translate(value, props.locale) || undefined
const items = computed(() => (props.field.options ?? []).map(option => ({
  value: option.value,
  label: translate(option.label, props.locale) || option.value,
})))
const html = computed(() => renderMarkdown(translate(props.field.content, props.locale)))

// Checkboxes carry their label next to the box instead of above it.
const isCheckbox = computed(() => props.field.type === 'checkbox')
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- renderMarkdown escapes all input -->
  <div
    v-if="field.type === 'markdown'"
    class="prose prose-sm max-w-none text-muted"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->

  <UFormField
    v-else
    :name="field.key"
    :label="isCheckbox ? undefined : text(field.label)"
    :description="isCheckbox ? undefined : text(field.description)"
    :required="field.required"
  >
    <UTextarea
      v-if="field.type === 'textarea'"
      v-model="model as string"
      :placeholder="text(field.placeholder)"
      :rows="5"
      class="w-full"
    />
    <USelect
      v-else-if="field.type === 'select'"
      v-model="model as string"
      :items="items"
      :placeholder="text(field.placeholder)"
      class="w-full"
    />
    <URadioGroup
      v-else-if="field.type === 'radio'"
      v-model="model as string"
      :items="items"
    />
    <UCheckbox
      v-else-if="field.type === 'checkbox'"
      v-model="model as boolean"
      :label="text(field.label)"
      :description="text(field.description)"
    />
    <UInputNumber
      v-else-if="field.type === 'number'"
      v-model="model as number"
      :placeholder="text(field.placeholder)"
      class="w-full"
    />
    <UFileUpload
      v-else-if="field.type === 'file'"
      v-model="model as File[]"
      :multiple="field.multiple"
      :accept="field.validation?.accept?.join(',')"
      class="w-full"
    />
    <UInput
      v-else
      v-model="model as string"
      :type="field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'"
      :autocomplete="field.autocomplete"
      :placeholder="text(field.placeholder)"
      class="w-full"
    />
  </UFormField>
</template>
