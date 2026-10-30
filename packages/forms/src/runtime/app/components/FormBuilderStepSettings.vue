<script setup lang="ts">
import type { FormStep } from '../../../types'
import { useModuleT } from '#imports'

// Settings of a selected step: title, help text and the condition that shows it.
defineProps<{
  step: FormStep
  /** Keys of the fields the step condition may look at. */
  conditionFields: string[]
}>()
const emit = defineEmits<{ patch: [patch: Partial<FormStep>] }>()

const t = useModuleT('forms')
</script>

<template>
  <aside class="space-y-4 border-b border-default bg-elevated/40 p-3">
    <h3 class="font-semibold">
      {{ t('builder.step', 'Step') }}
    </h3>
    <UFormField :label="t('builder.stepTitle', 'Title')">
      <FormBuilderText
        :model-value="step.title"
        @update:model-value="emit('patch', { title: $event })"
      />
    </UFormField>
    <UFormField :label="t('builder.description', 'Help text')">
      <FormBuilderText
        :model-value="step.description"
        @update:model-value="emit('patch', { description: $event })"
      />
    </UFormField>
    <FormBuilderCondition
      :model-value="step.showIf"
      :fields="conditionFields"
      @update:model-value="emit('patch', { showIf: $event })"
    />
  </aside>
</template>
