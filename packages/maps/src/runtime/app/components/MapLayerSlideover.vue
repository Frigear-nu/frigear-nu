<script setup lang="ts">
import { z } from 'zod'
import type { AdminMapLayerDto, Translated, Visibility } from '../../../types'
import { mapsApi } from '../../utils/api'
import { $fetch, reactive, useAction, useMapsTranslate, useModuleT } from '#imports'

defineOptions({ name: 'MapLayerSlideover' })

// Create and edit form of a stored layer, opened by `useMapLayerActions()`; closes with the saved layer or `false`.
const props = defineProps<{ mapId: string, layer?: AdminMapLayerDto }>()
const emit = defineEmits<{ close: [saved: AdminMapLayerDto | false] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const { busy, run } = useAction()

type State = { key: string, name: Translated | null, sort: number, visible: boolean, editable: boolean, visibility: Visibility | null }
const state = reactive<State>(props.layer
  ? { key: props.layer.key, name: props.layer.name, sort: props.layer.sort, visible: props.layer.visible, editable: props.layer.editable, visibility: props.layer.visibility }
  : { key: '', name: null, sort: 0, visible: true, editable: true, visibility: null })

const schema = z.object({
  key: z.string().trim().regex(/^[a-z0-9][\w.-]{0,127}$/i, t('admin.keyHelp', 'Letters, digits, ".", "_" and "-".')),
  name: z.union([z.string().trim().min(1), z.record(z.string(), z.string())]).nullable()
    .refine(value => !!tr(value), t('admin.layerNameRequired', 'Give the layer a name.')),
  sort: z.coerce.number().int(),
})

async function save() {
  const body = { key: state.key.trim(), name: state.name, sort: Number(state.sort), visible: state.visible, editable: state.editable, visibility: state.visibility }
  const name = tr(state.name)
  const saved = await run(
    () => props.layer
      ? $fetch<AdminMapLayerDto>(mapsApi.admin.layer(props.mapId, props.layer.id), { method: 'PATCH', body })
      : $fetch<AdminMapLayerDto>(mapsApi.admin.layers(props.mapId), { method: 'POST', body }),
    { success: props.layer ? t('admin.saved', 'Saved {name}', { name }) : t('admin.created', 'Created {name}', { name }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="map-layer-form"
    :title="layer ? t('admin.editLayer', 'Edit layer') : t('admin.addLayer', 'Add layer')"
    :submit-label="layer ? t('admin.saveLayer', 'Save layer') : t('admin.createLayer', 'Create layer')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="map-layer-form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="save"
    >
      <UFormField
        name="name"
        :label="t('admin.name', 'Name')"
        required
      >
        <TranslatedInput v-model="state.name" />
      </UFormField>
      <UFormField
        name="key"
        :label="t('admin.key', 'Key')"
        :description="t('admin.layerKeyHelp', 'Unique on the map, such as stations or routes.')"
        required
      >
        <UInput
          v-model="state.key"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="sort"
        :label="t('admin.sort', 'Order')"
        :description="t('admin.sortHelp', 'Lower numbers come first in the layer list.')"
      >
        <UInput
          v-model="state.sort"
          type="number"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="visible"
        :label="t('admin.visibleAtOpen', 'Shown when the map opens')"
      >
        <USwitch v-model="state.visible" />
      </UFormField>
      <UFormField
        name="editable"
        :label="t('admin.editable', 'Editable')"
        :description="t('admin.editableHelp', 'Features can be drawn, moved and removed on this layer.')"
      >
        <USwitch v-model="state.editable" />
      </UFormField>
      <UFormField
        name="visibility"
        :label="t('admin.visibility', 'Who can see it')"
        :description="t('admin.layerVisibilityHelp', 'A layer can only narrow who sees the map.')"
      >
        <MapsVisibilityInput
          v-model="state.visibility"
          inherit
        />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
