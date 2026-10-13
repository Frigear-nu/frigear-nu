<script setup lang="ts">
import type { FieldOption } from '../../../types'
import { arrayMove } from '../../utils'

// Editor for the options of a dropdown or single choice field.
const props = defineProps<{ options?: FieldOption[] }>()
const emit = defineEmits<{ 'update:options': [options: FieldOption[] | undefined] }>()

const t = useModuleT('forms')

function setOption(index: number, patch: Partial<FieldOption>) {
  const options = [...(props.options ?? [])]
  options[index] = { ...options[index]!, ...patch }
  emit('update:options', options)
}

function addOption() {
  const options = props.options ?? []
  emit('update:options', [...options, { value: `option_${options.length + 1}`, label: `Option ${options.length + 1}` }])
}

function moveOption(index: number, delta: -1 | 1) {
  emit('update:options', arrayMove(props.options ?? [], index, index + delta))
}
</script>

<template>
  <div class="space-y-2">
    <h4 class="text-sm font-medium">
      {{ t('builder.options', 'Options') }}
    </h4>
    <div
      v-for="(option, optionIndex) in options"
      :key="optionIndex"
      class="space-y-1 rounded-md border border-default p-2"
    >
      <FormBuilderText
        :model-value="option.label"
        :placeholder="t('builder.label', 'Label')"
        @update:model-value="setOption(optionIndex, { label: $event ?? '' })"
      />
      <UInput
        :model-value="option.value"
        :placeholder="t('builder.value', 'Value')"
        class="w-full font-mono"
        @update:model-value="setOption(optionIndex, { value: String($event) })"
      />
      <div class="flex justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-chevron-up"
          :disabled="optionIndex === 0"
          :aria-label="t('builder.moveUp', 'Move up')"
          @click="moveOption(optionIndex, -1)"
        />
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-chevron-down"
          :disabled="optionIndex === (options?.length ?? 0) - 1"
          :aria-label="t('builder.moveDown', 'Move down')"
          @click="moveOption(optionIndex, 1)"
        />
        <UButton
          color="error"
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          :aria-label="t('builder.delete', 'Delete')"
          @click="emit('update:options', options?.filter((_, i) => i !== optionIndex))"
        />
      </div>
    </div>
    <UButton
      color="neutral"
      variant="outline"
      size="xs"
      icon="i-lucide-plus"
      :label="t('builder.addOption', 'Add option')"
      @click="addOption"
    />
  </div>
</template>
