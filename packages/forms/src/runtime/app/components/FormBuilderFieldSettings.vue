<script setup lang="ts">
import type { FormField, FormStep } from '../../../types'
import type { CaptchaSecrets } from '../composables/useCaptchaSecrets'
import { translate } from '../../utils'
import type { FieldPosition } from '../../utils'
import { useFormBuilderLabels } from '../composables/useFormBuilderLabels'
import { useFormsLocale } from '../composables/useForms'
import { computed, useModuleT } from '#imports'

// Settings of the selected field, shown inline under its row: label, help text, key, options, validation,
// the step it lives in and the condition that shows it. Type specific parts live in their own components.
const props = defineProps<{
  field: FormField
  at: FieldPosition
  /** The titles of the steps the field can move to; only given for stepped forms. */
  steps?: FormStep[]
  /** Keys of the fields the field's condition may look at. */
  conditionFields: string[]
  /** The saved form; enables per-form secrets (captcha secret key). */
  formId?: string
  secrets: CaptchaSecrets
}>()
const emit = defineEmits<{
  patch: [patch: Partial<FormField>]
  rename: [key: string]
  moveToStep: [step: number]
}>()

const t = useModuleT('forms')
const locale = useFormsLocale()
const { typeLabel } = useFormBuilderLabels()

const hasOptions = computed(() => props.field.type === 'select' || props.field.type === 'radio')
const hasPlaceholder = computed(() => ['text', 'email', 'tel', 'number', 'textarea', 'select'].includes(props.field.type))
const hasLength = computed(() => ['text', 'email', 'tel', 'textarea'].includes(props.field.type))

function setValidation(key: 'minLength' | 'maxLength' | 'min' | 'max', value: number | null | undefined) {
  const { [key]: _old, ...rest } = props.field.validation ?? {}
  const validation = value === null || value === undefined || Number.isNaN(value) ? rest : { ...rest, [key]: value }
  emit('patch', { validation: Object.keys(validation).length ? validation : undefined })
}

function patchCaptcha(patch: Partial<NonNullable<FormField['captcha']>>) {
  const next = Object.fromEntries(Object.entries({ ...props.field.captcha, ...patch }).filter(([, value]) => value !== undefined && value !== ''))
  emit('patch', { captcha: next })
}
</script>

<template>
  <aside class="my-1 space-y-4 rounded-md border border-primary/40 bg-elevated/40 p-3">
    <h3 class="font-semibold">
      {{ typeLabel(field.type) }}
    </h3>

    <UFormField
      v-if="field.type === 'markdown'"
      :label="t('builder.content', 'Text (Markdown)')"
    >
      <FormBuilderText
        :model-value="field.content"
        multiline
        @update:model-value="emit('patch', { content: $event })"
      />
    </UFormField>
    <template v-else-if="field.type === 'captcha' && secrets.captcha">
      <FormBuilderCaptchaSettings
        :field="field"
        :form-id="formId"
        :secrets="secrets"
        @patch="patchCaptcha"
      />
    </template>
    <template v-else>
      <UFormField :label="t('builder.label', 'Label')">
        <FormBuilderText
          :model-value="field.label"
          @update:model-value="emit('patch', { label: $event })"
        />
      </UFormField>
      <UFormField :label="t('builder.description', 'Help text')">
        <FormBuilderText
          :model-value="field.description"
          @update:model-value="emit('patch', { description: $event })"
        />
      </UFormField>
      <UFormField
        v-if="hasPlaceholder"
        :label="t('builder.placeholder', 'Placeholder')"
      >
        <FormBuilderText
          :model-value="field.placeholder"
          @update:model-value="emit('patch', { placeholder: $event })"
        />
      </UFormField>
      <USwitch
        :model-value="!!field.required"
        :label="t('builder.required', 'Required')"
        @update:model-value="emit('patch', { required: $event === true || undefined })"
      />
      <FormBuilderPhoneSettings
        v-if="field.type === 'tel'"
        :field="field"
        @patch="emit('patch', $event)"
      />
      <USwitch
        v-if="field.type === 'file'"
        :model-value="!!field.multiple"
        :label="t('builder.multiple', 'Allow several files')"
        @update:model-value="emit('patch', { multiple: $event === true || undefined })"
      />
    </template>

    <UFormField
      :label="t('builder.key', 'Key')"
      :description="t('builder.keyHint', 'Identifies the answer. Letters, digits and underscores.')"
    >
      <UInput
        :model-value="field.key"
        class="w-full font-mono"
        @update:model-value="emit('rename', String($event))"
      />
    </UFormField>

    <FormBuilderOptions
      v-if="hasOptions"
      :options="field.options"
      @update:options="emit('patch', { options: $event })"
    />

    <div
      v-if="hasLength || field.type === 'number'"
      class="grid grid-cols-2 gap-2"
    >
      <template v-if="field.type === 'number'">
        <UFormField :label="t('builder.min', 'Minimum')">
          <UInputNumber
            :model-value="field.validation?.min"
            class="w-full"
            @update:model-value="setValidation('min', $event)"
          />
        </UFormField>
        <UFormField :label="t('builder.max', 'Maximum')">
          <UInputNumber
            :model-value="field.validation?.max"
            class="w-full"
            @update:model-value="setValidation('max', $event)"
          />
        </UFormField>
      </template>
      <template v-else>
        <UFormField :label="t('builder.minLength', 'Min length')">
          <UInputNumber
            :model-value="field.validation?.minLength"
            :min="0"
            class="w-full"
            @update:model-value="setValidation('minLength', $event)"
          />
        </UFormField>
        <UFormField :label="t('builder.maxLength', 'Max length')">
          <UInputNumber
            :model-value="field.validation?.maxLength"
            :min="1"
            class="w-full"
            @update:model-value="setValidation('maxLength', $event)"
          />
        </UFormField>
      </template>
    </div>

    <UFormField
      v-if="steps"
      :label="t('builder.step', 'Step')"
    >
      <USelect
        :model-value="at.step"
        :items="steps.map((s, i) => ({ value: i, label: `${i + 1}. ${translate(s.title, locale) || s.id}` }))"
        class="w-full"
        @update:model-value="emit('moveToStep', Number($event))"
      />
    </UFormField>

    <FormBuilderCondition
      :model-value="field.showIf"
      :fields="conditionFields"
      @update:model-value="emit('patch', { showIf: $event })"
    />
  </aside>
</template>
