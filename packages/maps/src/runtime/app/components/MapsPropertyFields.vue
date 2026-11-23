<script setup lang="ts">
import type { MapPropertyField } from '../../utils/fields'
import { useMapsTranslate, useModuleT } from '#imports'

defineOptions({ name: 'MapsPropertyFields' })

// The form fields of a feature kind's properties, generated from its zod schema (`propertyFields`). Inside a `UForm`,
// field names are `properties.<key>` so the server's issues (`properties.<key>`) land on the right field; `errors`
// shows the issues the schema found in the browser.
const props = defineProps<{ fields: MapPropertyField[], errors?: Record<string, string> }>()
const model = defineModel<Record<string, unknown>>({ required: true })

const t = useModuleT('maps')
const tr = useMapsTranslate()

const labelOf = (field: MapPropertyField) => tr(field.label) || field.key
const numberOf = (key: string) => typeof model.value[key] === 'number' ? model.value[key] as number : undefined
const set = (key: string, value: unknown) => {
  model.value = { ...model.value, [key]: value }
}
// A select cannot hold an empty value: "none" stands for leaving an optional choice unset.
const NONE = '__none'
const optionsOf = (field: MapPropertyField) => [
  ...(field.required ? [] : [{ label: t('editor.none', 'None'), value: NONE }]),
  ...(field.options ?? []).map(option => ({ label: option, value: option })),
]
</script>

<template>
  <UFormField
    v-for="field in props.fields"
    :key="field.key"
    :name="`properties.${field.key}`"
    :label="labelOf(field)"
    :description="tr(field.help) || undefined"
    :required="field.required"
    :error="props.errors?.[field.key]"
  >
    <TranslatedInput
      v-if="field.type === 'translated'"
      :model-value="model[field.key] as never"
      @update:model-value="set(field.key, $event)"
    />
    <UInput
      v-else-if="field.type === 'string'"
      :model-value="(model[field.key] as string | undefined) ?? ''"
      :maxlength="field.max"
      class="w-full"
      @update:model-value="set(field.key, $event)"
    />
    <UInput
      v-else-if="field.type === 'number'"
      type="number"
      :model-value="numberOf(field.key)"
      :min="field.min"
      :max="field.max"
      :step="field.integer ? 1 : 'any'"
      class="w-full"
      @update:model-value="set(field.key, String($event) === '' ? undefined : Number($event))"
    />
    <USwitch
      v-else-if="field.type === 'boolean'"
      :model-value="!!model[field.key]"
      @update:model-value="set(field.key, $event)"
    />
    <USelect
      v-else-if="field.type === 'enum'"
      :model-value="(model[field.key] as string | undefined) ?? (field.required ? undefined : NONE)"
      :items="optionsOf(field)"
      class="w-full"
      @update:model-value="set(field.key, $event === NONE ? undefined : $event)"
    />
    <p
      v-else
      class="text-sm text-muted"
    >
      {{ t('editor.unsupported', 'This property cannot be edited here.') }}
    </p>
  </UFormField>
</template>
