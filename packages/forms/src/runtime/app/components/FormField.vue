<script setup lang="ts">
import type { FormField } from '../../../types'
import { isCountryPhone, renderMarkdown, translate } from '../../utils'

const props = defineProps<{
  field: FormField
  locale: string
  /** Admin preview: captcha fields render a stub instead of the provider widget. */
  preview?: boolean
  /** Bumped by the form after a failed submit so captcha widgets reset. */
  captchaResetKey?: number
}>()
const model = defineModel<unknown>()

const t = useModuleT('forms')

/** Browser autofill hints for types that have an obvious one; an explicit `field.autocomplete` wins. */
const defaultAutocomplete: Partial<Record<FormField['type'], string>> = { email: 'email', tel: 'tel' }

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

  <UFormField
    v-else-if="field.type === 'captcha'"
    :name="field.key"
    :label="text(field.label)"
    :description="text(field.description)"
  >
    <ClientOnly>
      <FormCaptcha
        v-model="model as string | undefined"
        :field="field"
        :preview="preview"
        :reset-key="captchaResetKey"
      />
      <template #fallback>
        <div class="h-[65px] rounded-md bg-elevated/50" />
      </template>
    </ClientOnly>
  </UFormField>

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
    <FormPhoneInput
      v-else-if="isCountryPhone(field)"
      v-model="model as string | undefined"
      :config="field.phone"
      :locale="locale"
      :placeholder="text(field.placeholder)"
      :country-label="t('field.phoneCountry', 'Country')"
    />
    <UInput
      v-else
      v-model="model as string"
      :type="field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'"
      :inputmode="field.type === 'tel' ? 'tel' : undefined"
      :autocomplete="field.autocomplete ?? defaultAutocomplete[field.type]"
      :placeholder="text(field.placeholder)"
      class="w-full"
    />
  </UFormField>
  <!-- eslint-enable vue/no-v-html -->
</template>
