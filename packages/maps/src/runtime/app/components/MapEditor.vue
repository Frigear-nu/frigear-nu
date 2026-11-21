<script setup lang="ts">
import type { MapEditorTool, MapFeatureDto, MapGeometry, MapGeometryType, MapSummaryDto, Translated } from '../../../types'
import { featureKinds, kinds, propertySchemas } from '#maps/registry'
import { mapsApi } from '../../utils/api'
import { cleanPropertyValues, initialPropertyValues, propertyFields } from '../../utils/fields'
import type { MapPropertyField } from '../../utils/fields'
import { $fetch, computed, reactive, ref, shallowRef, useAction, useConfirmDialog, useLazyFetch, useMap, useMapsTranslate, useModuleT, useTemplateRef, watch } from '#imports'

defineOptions({ name: 'MapEditor' })

// Draw on a map with leaflet-geoman: the toolbar offers only the map kind's `editorTools`, plane maps can snap to the
// grid, and every feature gets a property form generated from its feature kind's zod schema. Saves through the API
// (`maps:edit`); callers without it see the map read-only.
const props = withDefaults(defineProps<{
  /** The map's key or id. */
  map: string
  /** The canvas height (any CSS length). */
  height?: string
}>(), { height: '32rem' })

const emit = defineEmits<{ saved: [feature: MapFeatureDto], removed: [featureId: string] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const confirm = useConfirmDialog()
const { busy, run } = useAction()
const canvas = useTemplateRef<{ discardDraft: () => void, focus: (id: string) => boolean }>('canvas')
const { detail, map, layers, features, canEdit, refresh } = await useMap(() => props.map)

const kind = computed(() => map.value ? kinds[map.value.kind] : undefined)
const tools = computed<MapEditorTool[]>(() => kind.value?.editorTools ?? [])
const plane = computed(() => map.value?.base === 'plane')
const snap = ref(true)
const editableLayers = computed(() => layers.value.filter(layer => layer.editable))
const layerId = ref<string | undefined>(editableLayers.value[0]?.id)
watch(editableLayers, (list) => {
  if (!list.some(layer => layer.id === layerId.value)) layerId.value = list[0]?.id
})

// What the panel edits: a new drawing (`draft`) or a stored feature (`selectedId`).
const draft = shallowRef<{ shape: string, geometry: MapGeometry } | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed(() => features.value.find(feature => feature.id === selectedId.value) ?? null)
// Callers without `maps:edit`, and features on a locked layer, get the form to read only.
const readOnly = computed(() => !canEdit.value
  || (!!selected.value && !layers.value.find(layer => layer.id === selected.value!.layerId)?.editable))
const form = reactive<{ featureKind: string, label: Translated | null, properties: Record<string, unknown>, linkMapId: string }>({
  featureKind: '',
  label: null,
  properties: {},
  linkMapId: '',
})
const NO_LINK = '__none'

const geometryType = computed<MapGeometryType | undefined>(() => draft.value?.geometry.type ?? selected.value?.geometry.type)
const kindOptions = computed(() => (kind.value?.featureKinds ?? [])
  .filter(id => !geometryType.value || featureKinds[id]?.geometry.includes(geometryType.value))
  .map(id => ({ label: tr(featureKinds[id]?.label) || id, value: id, icon: featureKinds[id]?.icon ?? undefined })))

const fields = shallowRef<MapPropertyField[]>([])
watch(() => form.featureKind, async (id) => {
  const load = id ? propertySchemas[id] : undefined
  fields.value = load ? propertyFields(await load()) : []
}, { immediate: true })

const { data: otherMaps } = useLazyFetch<MapSummaryDto[]>(mapsApi.list, { key: 'maps:editor:link-targets', server: false })
const linkOptions = computed(() => [
  { label: t('editor.noLink', 'No link'), value: NO_LINK },
  ...(otherMaps.value ?? []).filter(other => other.id !== map.value?.id).map(other => ({ label: tr(other.name) || other.key || other.id, value: other.id })),
])

function defaultKindFor(shape: string, type: MapGeometryType): string {
  const candidates = (kind.value?.featureKinds ?? []).filter(id => featureKinds[id]?.geometry.includes(type))
  if (shape === 'Text' && candidates.includes('maps.label')) return 'maps.label'
  return candidates.find(id => id !== 'maps.label') ?? candidates[0] ?? ''
}

async function onCreate(value: { shape: string, geometry: MapGeometry }) {
  selectedId.value = null
  draft.value = value
  form.featureKind = defaultKindFor(value.shape, value.geometry.type)
  form.label = null
  form.linkMapId = NO_LINK
  const load = form.featureKind ? propertySchemas[form.featureKind] : undefined
  form.properties = initialPropertyValues(load ? propertyFields(await load()) : [])
}

function onSelect(featureId: string | null) {
  const feature = features.value.find(candidate => candidate.id === featureId)
  if (!feature) return
  canvas.value?.discardDraft()
  draft.value = null
  selectedId.value = feature.id
  form.featureKind = feature.featureKind
  form.label = feature.label
  form.properties = { ...feature.properties }
  form.linkMapId = feature.linkMapId ?? NO_LINK
}

function close() {
  canvas.value?.discardDraft()
  draft.value = null
  selectedId.value = null
}

async function save() {
  if (!map.value || readOnly.value) return
  const body = {
    featureKind: form.featureKind,
    label: form.label || null,
    properties: cleanPropertyValues(fields.value, form.properties),
    linkMapId: form.linkMapId === NO_LINK ? null : form.linkMapId,
  }
  const name = tr(form.label) || tr(featureKinds[form.featureKind]?.label)
  const saved = await run(
    () => draft.value
      ? $fetch<MapFeatureDto>(mapsApi.features(map.value!.id), { method: 'POST', body: { ...body, layerId: layerId.value, geometry: draft.value.geometry } })
      : $fetch<MapFeatureDto>(mapsApi.feature(map.value!.id, selectedId.value!), { method: 'PATCH', body }),
    { success: t('editor.saved', 'Saved {name}', { name }), error: t('editor.saveFailed', 'Could not save the feature') },
  )
  if (!saved) return
  close()
  await refresh()
  emit('saved', saved)
}

async function onChange(featureId: string, geometry: MapGeometry) {
  if (!map.value) return
  const saved = await run(
    () => $fetch<MapFeatureDto>(mapsApi.feature(map.value!.id, featureId), { method: 'PATCH', body: { geometry } }),
    { error: t('editor.moveFailed', 'Could not save the new shape') },
  )
  if (!saved) await refresh()
}

async function remove(featureId: string) {
  if (!map.value) return
  const feature = features.value.find(candidate => candidate.id === featureId)
  const name = tr(feature?.label) || tr(feature ? featureKinds[feature.featureKind]?.label : undefined)
  const confirmed = await confirm({
    title: t('editor.deleteTitle', 'Delete {name}?', { name }),
    description: t('editor.deleteDescription', 'The feature is removed from the map for everyone.'),
    confirmText: t('editor.deleteAction', 'Delete feature'),
    destructive: true,
  })
  if (!confirmed) {
    // The removal tool took it off the canvas already: bring it back.
    await refresh()
    return
  }
  const done = await run(
    () => $fetch(mapsApi.feature(map.value!.id, featureId), { method: 'DELETE' }).then(() => true),
    { success: t('editor.deleted', 'Deleted {name}', { name }), error: t('editor.deleteFailed', 'Could not delete the feature') },
  )
  if (selectedId.value === featureId) close()
  await refresh()
  if (done) emit('removed', featureId)
}
</script>

<template>
  <div
    class="flex flex-col gap-3"
    data-maps-editor
    :data-map="props.map"
    :data-map-id="map?.id"
    :data-map-base="map?.base"
    :data-editor-tools="tools.join(' ')"
  >
    <UAlert
      v-if="detail && !canEdit"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :title="t('editor.readOnly', 'You can look at this map, but not change it.')"
    />
    <div
      v-if="detail && map"
      class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <div
        class="relative overflow-hidden rounded-md border border-default bg-elevated"
        :style="{ height: props.height }"
      >
        <ClientOnly>
          <MapsCanvas
            ref="canvas"
            :detail="detail"
            :map-key="props.map"
            :edit="canEdit"
            :tools="tools"
            :snap="plane && tools.includes('snapGrid') && snap"
            @create="onCreate"
            @select="onSelect"
            @change="onChange"
            @remove="remove"
          />
          <template #fallback>
            <USkeleton
              class="size-full rounded-none"
              data-testid="maps-skeleton"
            />
          </template>
        </ClientOnly>
      </div>

      <div
        class="flex flex-col gap-4 rounded-md border border-default p-4"
        data-testid="maps-editor-panel"
      >
        <template v-if="draft || selected">
          <div class="flex items-center justify-between gap-2">
            <p class="font-medium">
              {{ draft ? t('editor.newFeature', 'New feature') : readOnly ? t('editor.viewFeature', 'Feature') : t('editor.editFeature', 'Edit feature') }}
            </p>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('editor.close', 'Close')"
              @click="close"
            />
          </div>
          <UForm
            id="maps-feature-form"
            :state="form"
            :disabled="readOnly"
            :data-read-only="readOnly || undefined"
            class="flex flex-col gap-4"
            @submit="save"
          >
            <!-- A disabled fieldset turns every input inside off, also the ones of TranslatedInput. -->
            <fieldset
              :disabled="readOnly"
              class="flex min-w-0 flex-col gap-4"
            >
              <UFormField
                name="featureKind"
                :label="t('editor.featureKind', 'Kind')"
                required
              >
                <USelect
                  v-model="form.featureKind"
                  :items="kindOptions"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                name="label"
                :label="form.featureKind === 'maps.label' ? t('editor.text', 'Text') : t('editor.label', 'Label')"
                :description="t('editor.labelHelp', 'Shown in the popup and on labels.')"
              >
                <TranslatedInput v-model="form.label" />
              </UFormField>
              <MapsPropertyFields
                v-model="form.properties"
                :fields="fields"
              />
              <UFormField
                name="linkMapId"
                :label="t('editor.link', 'Links to map')"
                :description="t('editor.linkHelp', 'Lets people open another map from this feature, such as a bar layout from the site map.')"
              >
                <USelect
                  v-model="form.linkMapId"
                  :items="linkOptions"
                  class="w-full"
                />
              </UFormField>
            </fieldset>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                v-if="selected && !readOnly"
                color="error"
                variant="outline"
                icon="i-lucide-trash-2"
                :label="t('editor.deleteAction', 'Delete feature')"
                @click="remove(selected.id)"
              />
              <UButton
                color="neutral"
                variant="outline"
                :label="readOnly ? t('editor.close', 'Close') : t('editor.cancel', 'Cancel')"
                @click="close"
              />
              <UButton
                v-if="!readOnly"
                type="submit"
                :loading="busy"
                :disabled="!form.featureKind"
                :label="t('editor.saveFeature', 'Save feature')"
              />
            </div>
          </UForm>
        </template>

        <template v-else>
          <p class="text-sm text-muted">
            {{ canEdit
              ? t('editor.hint', 'Draw with the tools on the map, or click a feature to edit it.')
              : t('editor.hintReadOnly', 'Click a feature to see it.') }}
          </p>
          <UFormField
            v-if="canEdit && editableLayers.length > 1"
            name="layerId"
            :label="t('editor.layer', 'Draw on layer')"
          >
            <USelect
              v-model="layerId"
              :items="editableLayers.map(layer => ({ label: tr(layer.name) || layer.key, value: layer.id }))"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="canEdit && plane && tools.includes('snapGrid')"
            name="snap"
            :label="t('editor.snap', 'Snap to grid')"
            :description="t('editor.snapHelp', 'Rounds corners and points to the plan\'s grid.')"
          >
            <USwitch v-model="snap" />
          </UFormField>
          <p
            v-if="canEdit && !editableLayers.length"
            class="text-sm text-warning"
          >
            {{ t('editor.noEditableLayer', 'This map has no layer you can draw on.') }}
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
