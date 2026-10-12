<script setup lang="ts">
import type { Condition, ConditionOp } from '../../../types'

const props = defineProps<{
  /** Keys of the fields (before this one) a condition may look at. */
  fields: string[]
}>()
const model = defineModel<Condition | undefined>()

const t = useModuleT('forms')
const ops: ConditionOp[] = ['eq', 'neq', 'in', 'empty', 'notEmpty']
const opNames: Record<ConditionOp, string> = { eq: 'is equal to', neq: 'is not equal to', in: 'is one of', empty: 'is empty', notEmpty: 'has an answer', truthy: 'has an answer' }

/** Operators that compare nothing, so no value is asked for. */
const withoutValue = (op: ConditionOp) => op === 'empty' || op === 'notEmpty' || op === 'truthy'

const text = computed(() => {
  const value = model.value?.value
  return Array.isArray(value) ? value.join(', ') : String(value ?? '')
})

function patch(next: Partial<Condition>) {
  const current = model.value ?? { field: props.fields[0] ?? '', op: 'eq' as ConditionOp }
  model.value = { ...current, ...next }
}

function setValue(raw: string) {
  patch({ value: model.value?.op === 'in' ? raw.split(',').map(part => part.trim()).filter(Boolean) : raw })
}
</script>

<template>
  <div class="space-y-2">
    <USwitch
      :model-value="!!model"
      :disabled="!fields.length"
      :label="t('builder.conditional', 'Show only if…')"
      @update:model-value="model = $event ? { field: fields[0]!, op: 'eq', value: '' } : undefined"
    />
    <p
      v-if="!fields.length"
      class="text-xs text-muted"
    >
      {{ t('builder.noEarlierFields', 'Add a field before this one to use as a condition.') }}
    </p>
    <div
      v-else-if="model"
      class="grid gap-2"
    >
      <USelect
        :model-value="model.field"
        :items="fields"
        class="w-full"
        @update:model-value="patch({ field: String($event) })"
      />
      <USelect
        :model-value="model.op === 'truthy' ? 'notEmpty' : model.op"
        :items="ops.map(value => ({ value, label: t(`builder.ops.${value}`, opNames[value]) }))"
        class="w-full"
        @update:model-value="patch({ op: $event as ConditionOp, value: undefined })"
      />
      <UInput
        v-if="!withoutValue(model.op)"
        :model-value="text"
        :placeholder="model.op === 'in' ? t('builder.valuesHint', 'a, b, c') : t('builder.value', 'Value')"
        class="w-full"
        @update:model-value="setValue(String($event))"
      />
    </div>
  </div>
</template>
