<script setup lang="ts">
import { z } from 'zod'
import type { AdminMapDto, OwnerRef, Translated, Visibility } from '../../../types'
import { kinds } from '#maps/registry'
import { mapsApi } from '../../utils/api'
import { $fetch, computed, reactive, useAction, useMapsTranslate, useModuleT } from '#imports'

defineOptions({ name: 'MapFormSlideover' })

// Create and edit form of a map, opened with `useOverlay()` by `useMapActions()`: it closes with the saved map, or
// `false` when cancelled. The kind is chosen once; an `owner` given by the caller (an operation's "Maps" tab) is fixed.
const props = defineProps<{ map?: AdminMapDto, owner?: OwnerRef }>()
const emit = defineEmits<{ close: [saved: AdminMapDto | false] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const { busy, run } = useAction()

const kindOptions = computed(() => Object.values(kinds)
  .filter(kind => !props.owner || !kind.ownerType || kind.ownerType === props.owner.type)
  .map(kind => ({ label: `${tr(kind.label)} (${kind.base === 'geo' ? t('admin.baseGeo', 'geographic') : t('admin.basePlane', 'floor plan')})`, value: kind.id })))

type State = { name: Translated | null, kind: string, ownerType: string, ownerId: string, key: string, visibility: Visibility | null }
const state = reactive<State>(props.map
  ? { name: props.map.name, kind: props.map.kind, ownerType: props.map.ownerType, ownerId: props.map.ownerId ?? '', key: props.map.key ?? '', visibility: props.map.visibility }
  : { name: null, kind: kindOptions.value[0]?.value ?? '', ownerType: props.owner?.type ?? 'platform', ownerId: props.owner?.id ?? '', key: '', visibility: null })

const schema = z.object({
  name: z.union([z.string().trim().min(1), z.record(z.string(), z.string())]).nullable()
    .refine(value => !!tr(value), t('admin.nameRequired', 'Give the map a name.')),
  kind: z.string().min(1, t('admin.kindRequired', 'Choose a kind.')),
  ownerType: z.string().trim().min(1),
  ownerId: z.string().trim(),
  key: z.string().trim().regex(/^$|^[a-z0-9][\w.-]{0,127}$/i, t('admin.keyHelp', 'Letters, digits, ".", "_" and "-".')),
})

async function save() {
  const body = {
    name: state.name,
    key: state.key.trim() || null,
    visibility: state.visibility,
    ...(props.owner && !props.map ? {} : { ownerType: state.ownerType.trim(), ownerId: state.ownerType.trim() === 'platform' ? null : (state.ownerId.trim() || null) }),
  }
  const name = tr(state.name)
  const saved = await run(
    () => props.map
      ? $fetch<AdminMapDto>(mapsApi.admin.map(props.map.id), { method: 'PATCH', body })
      : $fetch<AdminMapDto>(mapsApi.admin.maps, {
          method: 'POST',
          body: { ...body, kind: state.kind, ownerType: props.owner?.type ?? body.ownerType, ownerId: props.owner ? props.owner.id : body.ownerId },
        }),
    { success: props.map ? t('admin.saved', 'Saved {name}', { name }) : t('admin.created', 'Created {name}', { name }) },
  )
  if (saved) emit('close', saved)
}
</script>

<template>
  <FormSlideover
    form-id="map-form"
    :title="map ? t('admin.editTitle', 'Edit map') : t('admin.create', 'Add map')"
    :description="map ? undefined : t('admin.createDescription', 'It starts with its kind\'s view and layers. Draw on it once it is created.')"
    :submit-label="map ? t('admin.saveMap', 'Save map') : t('admin.createAction', 'Create map')"
    :loading="busy"
    @close="emit('close', false)"
  >
    <UForm
      id="map-form"
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
        v-if="!map"
        name="kind"
        :label="t('admin.kind', 'Kind')"
        :description="t('admin.kindHelp', 'What the map is for: it sets the base, the tools and what can be drawn.')"
        required
      >
        <USelect
          v-model="state.kind"
          :items="kindOptions"
          class="w-full"
        />
      </UFormField>
      <template v-if="!owner || map">
        <UFormField
          name="ownerType"
          :label="t('admin.ownerType', 'Owner type')"
          :description="t('admin.ownerTypeHelp', 'platform, operation, team, or a type another module adds.')"
          required
        >
          <UInput
            v-model="state.ownerType"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="state.ownerType !== 'platform'"
          name="ownerId"
          :label="t('admin.ownerId', 'Owner id')"
          required
        >
          <UInput
            v-model="state.ownerId"
            class="w-full"
          />
        </UFormField>
      </template>
      <UFormField
        name="key"
        :label="t('admin.key', 'Key')"
        :description="t('admin.keyDescription', 'Optional stable name for links and code, such as roskilde-2027-site.')"
      >
        <UInput
          v-model="state.key"
          class="w-full"
        />
      </UFormField>
      <UFormField
        name="visibility"
        :label="t('admin.visibility', 'Who can see it')"
      >
        <MapsVisibilityInput v-model="state.visibility" />
      </UFormField>
    </UForm>
  </FormSlideover>
</template>
