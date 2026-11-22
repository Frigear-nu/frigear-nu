<script setup lang="ts">
import type { FeatureGroup, Layer, Map as LeafletMap } from 'leaflet'
import { kinds as registeredKinds, propertySchemas } from '#maps/registry'
import { createMap, featureColor, geometryLayer, geometryOfLayer, isLabelFeature, loadLeafletWithGeoman, pinIcon, planeBounds, underlayLayer } from '../utils/leaflet'
import type { LeafletModule } from '../utils/leaflet'
import { PLANE_GRID_SIZE, planeExtentOf, snapGeometry, toolsForGeometries, withPlaneUnderlay } from '../../utils/geometry'
import { UNDERLAY_TYPES, isSameAppPath } from '../../utils/image'
import { cleanPropertyValues, initialPropertyValues, propertyFields } from '../../utils/fields'
import type { MapPropertyField } from '../../utils/fields'
import { newFeatureId } from '../../utils'
import type { MapFeatureKindInfo, MapGeometryType, PlaneFeature, PlaneFeatureCollection, PlaneGeometry, PlaneUnderlay, Translated } from '../../../types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useAction, useConfirmDialog, useMapsTranslate, useModuleT, useRuntimeConfig, useTemplateRef, watch } from '#imports'

defineOptions({ name: 'MapPlaneEditor' })

// Draws a plane layout (`PlaneFeatureCollection`) with leaflet-geoman: an underlay image, snapping to a grid, and only
// the feature kinds in `kinds`. Every feature gets a stable id and a form generated from its kind's zod schema. Works
// on `v-model` only: the module that owns the value saves it (and checks it with `validatePlaneLayout`).
const props = withDefaults(defineProps<{
  /** The feature kinds that may be drawn (registered ids). Default: every registered kind. */
  kinds?: string[]
  /** Uploads an underlay image and returns where it is. Without it, the underlay cannot be changed here. */
  upload?: (file: File) => Promise<PlaneUnderlay>
  /** The grid to snap to, in plane units; `0` turns snapping off. */
  grid?: number
  /** The canvas height (any CSS length). */
  height?: string
  disabled?: boolean
}>(), { grid: PLANE_GRID_SIZE, height: '32rem' })

const model = defineModel<PlaneFeatureCollection>({ default: () => ({ type: 'FeatureCollection', features: [] }) })
const emit = defineEmits<{ select: [featureId: string | null] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const confirm = useConfirmDialog()
const { busy, run } = useAction()
const maxBytes = Number(useRuntimeConfig().public.maps?.maxUnderlayBytes) || 10 * 1024 * 1024
const el = useTemplateRef<HTMLElement>('el')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const failed = ref(false)
const snap = ref(props.grid > 0)

const allowed = computed<MapFeatureKindInfo[]>(() => (props.kinds ?? Object.keys(registeredKinds))
  .map(id => registeredKinds[id])
  .filter((kind): kind is MapFeatureKindInfo => !!kind))
const tools = computed(() => toolsForGeometries([...new Set(allowed.value.flatMap(kind => kind.geometry))]))
const features = computed(() => model.value?.features ?? [])

const selectedId = ref<string | null>(null)
const selected = computed(() => features.value.find(feature => feature.id === selectedId.value) ?? null)
const selectedKind = computed(() => selected.value ? registeredKinds[selected.value.kind] : undefined)
const kindOptions = computed(() => allowed.value
  .filter(kind => !selected.value || kind.geometry.includes(selected.value.geometry.type))
  .map(kind => ({ label: tr(kind.label) || kind.id, value: kind.id, icon: kind.icon ?? undefined })))

const fields = shallowRef<MapPropertyField[]>([])
const schema = shallowRef<{ safeParse: (value: unknown) => { success: boolean, error?: { issues: Array<{ path: PropertyKey[], message: string }> } } } | null>(null)
async function loadSchema(kind: string | undefined) {
  const load = kind ? propertySchemas[kind] : undefined
  const loaded = load ? await load() as typeof schema.value : null
  schema.value = loaded
  fields.value = loaded ? propertyFields(loaded) : []
}
watch(() => selected.value?.kind, kind => loadSchema(kind), { immediate: true })

const errors = computed<Record<string, string>>(() => {
  if (!selected.value || !schema.value) return {}
  const result = schema.value.safeParse(cleanPropertyValues(fields.value, selected.value.properties))
  const map: Record<string, string> = {}
  for (const issue of result.error?.issues ?? []) {
    const key = String(issue.path[0] ?? '')
    if (key && !map[key]) map[key] = issue.message
  }
  return map
})

const kindLabel = (feature: PlaneFeature) => tr(registeredKinds[feature.kind]?.label) || feature.kind
const featureName = (feature: PlaneFeature) => tr(feature.label) || kindLabel(feature)

function setFeatures(next: PlaneFeature[]) {
  model.value = { ...model.value, type: 'FeatureCollection', features: next }
}

function updateFeature(id: string, patch: Partial<PlaneFeature>) {
  setFeatures(features.value.map(feature => feature.id === id ? { ...feature, ...patch } : feature))
}

function select(id: string | null) {
  selectedId.value = id
  emit('select', id)
}

function defaultKindFor(shape: string, type: MapGeometryType): MapFeatureKindInfo | undefined {
  const candidates = allowed.value.filter(kind => kind.geometry.includes(type))
  if (shape === 'Text') return candidates.find(kind => kind.id === 'maps.label') ?? candidates[0]
  return candidates.find(kind => kind.id !== 'maps.label') ?? candidates[0]
}

const snapped = (geometry: PlaneGeometry) => snap.value && props.grid > 0 ? snapGeometry(geometry, props.grid) : geometry

async function addFeature(shape: string, geometry: PlaneGeometry) {
  const kind = defaultKindFor(shape, geometry.type)
  if (!kind) return
  const load = propertySchemas[kind.id]
  const properties = load ? initialPropertyValues(propertyFields(await load())) : {}
  const feature: PlaneFeature = { type: 'Feature', id: newFeatureId(), kind: kind.id, geometry: snapped(geometry), properties, label: null }
  setFeatures([...features.value, feature])
  select(feature.id)
}

async function removeFeature(id: string) {
  const feature = features.value.find(candidate => candidate.id === id)
  if (!feature) return
  const confirmed = await confirm({
    title: t('editor.deleteTitle', 'Delete {name}?', { name: featureName(feature) }),
    description: t('editor.deleteDescription', 'It is removed from the layout when you save. Anything that refers to it by its id loses its place.'),
    confirmText: t('editor.deleteAction', 'Delete feature'),
    destructive: true,
  })
  if (!confirmed) {
    // The removal tool took it off the canvas already: bring it back.
    render()
    return
  }
  if (selectedId.value === id) select(null)
  setFeatures(features.value.filter(candidate => candidate.id !== id))
}

function changeKind(kind: string) {
  if (!selected.value) return
  updateFeature(selected.value.id, { kind, properties: {} })
  loadSchema(kind).then(() => {
    if (selected.value?.kind === kind) updateFeature(selected.value.id, { properties: initialPropertyValues(fields.value) })
  })
}

// --- Underlay ---------------------------------------------------------------------------------------------------------
const uploadProblem = ref<string | null>(null)

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  uploadProblem.value = null
  if (!file || !props.upload) return
  if (!(UNDERLAY_TYPES as readonly string[]).includes(file.type)) {
    uploadProblem.value = t('editor.underlayType', 'Choose a PNG, JPEG or WebP image.')
    return
  }
  if (file.size > maxBytes) {
    uploadProblem.value = t('editor.underlayTooLarge', 'The image is larger than {size}.', { size: `${Math.round(maxBytes / 1024 / 1024)} MB` })
    return
  }
  const underlay = await run(() => props.upload!(file), {
    success: t('editor.underlaySaved', 'Underlay uploaded'),
    error: t('editor.underlayFailed', 'Could not upload the image'),
  })
  if (!underlay) return
  model.value = withPlaneUnderlay({ ...model.value, type: 'FeatureCollection' as const }, underlay)
  // With a parent `v-model` the new value arrives after the parent re-renders: fit to it, not to the old extent.
  await nextTick()
  fit()
}

async function removeUnderlay() {
  const confirmed = await confirm({
    title: t('editor.removeUnderlayTitle', 'Remove the underlay?'),
    description: t('editor.removeUnderlayDescription', 'The image is no longer shown under the layout. Drawn features stay where they are.'),
    confirmText: t('editor.removeUnderlayAction', 'Remove underlay'),
    destructive: true,
  })
  if (confirmed) model.value = { ...model.value, type: 'FeatureCollection', underlay: null }
}

// --- Leaflet ----------------------------------------------------------------------------------------------------------
type FeatureLayer = Layer & { mapsFeatureId?: string }
type PmMap = LeafletMap & {
  pm: {
    addControls: (options: Record<string, unknown>) => void
    removeControls: () => void
    setGlobalOptions: (options: Record<string, unknown>) => void
  }
}

let L: LeafletModule | undefined
let map: LeafletMap | undefined
let group: FeatureGroup | undefined
let underlay: Layer | undefined
let disposed = false

function render() {
  if (!L || !map) return
  group?.remove()
  underlay?.remove()
  underlay = undefined
  if (model.value?.underlay && isSameAppPath(model.value.underlay.url)) underlay = underlayLayer(L, model.value.underlay).addTo(map)
  group = L.featureGroup().addTo(map)
  for (const feature of features.value) {
    const kind = registeredKinds[feature.kind]
    const layer = geometryLayer(L, feature.geometry, {
      color: feature.id === selectedId.value ? featureColor('warning', null) : featureColor(feature.properties.color, kind?.color),
      label: featureName(feature),
      labelSize: feature.properties.size,
      asLabel: isLabelFeature(feature),
      editable: !props.disabled,
    }) as FeatureLayer
    layer.mapsFeatureId = feature.id
    layer.on('click', (event) => {
      L!.DomEvent.stopPropagation(event)
      select(feature.id)
    })
    if (!props.disabled) {
      layer.on('pm:edit', () => updateFeature(feature.id, { geometry: snapped(geometryOfLayer(layer)) }))
    }
    group.addLayer(layer)
  }
}

function fit() {
  if (!map) return
  map.fitBounds(planeBounds(planeExtentOf(model.value)), { padding: [16, 16] })
}

function setupTools() {
  if (!map) return
  const pm = (map as PmMap).pm
  pm.removeControls()
  if (props.disabled) return
  pm.setGlobalOptions({ markerStyle: { icon: pinIcon(L!, featureColor('primary', null)) }, snappable: true, snapDistance: 12 })
  pm.addControls({
    position: 'topleft',
    drawMarker: tools.value.includes('marker'),
    drawPolyline: tools.value.includes('polyline'),
    drawPolygon: tools.value.includes('polygon'),
    drawRectangle: tools.value.includes('rectangle'),
    drawText: false,
    drawCircle: false,
    drawCircleMarker: false,
    cutPolygon: false,
    rotateMode: false,
    editMode: true,
    dragMode: true,
    removalMode: true,
  })
}

onMounted(async () => {
  try {
    L = await loadLeafletWithGeoman()
  }
  catch {
    failed.value = true
    return
  }
  if (disposed || !el.value) return
  map = createMap(L, el.value, { plane: true })
  map.on('click', () => select(null))
  map.on('pm:create', (event) => {
    const { shape, layer } = event as unknown as { shape: string, layer: Layer }
    const geometry = geometryOfLayer(layer)
    layer.remove()
    addFeature(shape, geometry)
  })
  map.on('pm:remove', (event) => {
    const { layer } = event as unknown as { layer: FeatureLayer }
    if (layer.mapsFeatureId) removeFeature(layer.mapsFeatureId)
  })
  fit()
  setupTools()
  render()
})

watch(model, () => render(), { deep: true })
watch(selectedId, () => render())
watch(() => [props.disabled, tools.value.join()], () => {
  setupTools()
  render()
})

onBeforeUnmount(() => {
  disposed = true
  map?.remove()
  map = undefined
})

// Exposed for the tests and for pages that select a feature from elsewhere (a list beside the editor).
defineExpose({ select, fit })

const canDraw = computed(() => tools.value.length > 0)
const setProperties = (value: Record<string, unknown>) => selected.value && updateFeature(selected.value.id, { properties: value })
const setLabel = (value: Translated | null | undefined) => selected.value && updateFeature(selected.value.id, { label: value || null })
</script>

<template>
  <div
    class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]"
    data-maps-plane-editor
    :data-feature-count="features.length"
    :data-tools="tools.join(' ')"
  >
    <div
      class="relative overflow-hidden rounded-md border border-default bg-elevated"
      :style="{ height: props.height }"
    >
      <ClientOnly>
        <div class="relative isolate size-full">
          <div
            ref="el"
            class="size-full"
            data-testid="maps-plane-canvas"
          />
          <div
            v-if="failed"
            class="absolute inset-0 flex items-center justify-center text-sm text-muted"
          >
            {{ t('view.loadFailed', 'The map could not be loaded.') }}
          </div>
        </div>
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
      <template v-if="selected">
        <div class="flex items-center justify-between gap-2">
          <p class="font-medium">
            {{ featureName(selected) }}
          </p>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('editor.close', 'Close')"
            @click="select(null)"
          />
        </div>
        <fieldset
          :disabled="props.disabled"
          class="flex min-w-0 flex-col gap-4"
          data-testid="maps-feature-form"
        >
          <UFormField
            :label="t('editor.featureKind', 'Kind')"
            required
          >
            <USelect
              :model-value="selected.kind"
              :items="kindOptions"
              class="w-full"
              @update:model-value="changeKind($event as string)"
            />
          </UFormField>
          <UFormField
            :label="selected.kind === 'maps.label' ? t('editor.text', 'Text') : t('editor.label', 'Label')"
            :description="t('editor.labelHelp', 'Shown on the layout and in the details.')"
          >
            <TranslatedInput
              :model-value="selected.label ?? null"
              @update:model-value="setLabel($event)"
            />
          </UFormField>
          <MapsPropertyFields
            :model-value="selected.properties"
            :fields="fields"
            :errors="errors"
            @update:model-value="setProperties($event)"
          />
          <p class="text-xs text-muted">
            {{ t('editor.featureId', 'Id: {id}', { id: selected.id }) }}
          </p>
        </fieldset>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            v-if="!props.disabled"
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            :label="t('editor.deleteAction', 'Delete feature')"
            @click="removeFeature(selected.id)"
          />
          <UButton
            color="neutral"
            variant="outline"
            :label="t('editor.done', 'Done')"
            @click="select(null)"
          />
        </div>
        <p
          v-if="selectedKind && !selectedKind.geometry.includes(selected.geometry.type)"
          class="text-sm text-warning"
        >
          {{ t('editor.wrongGeometry', 'This kind cannot have this shape: choose another kind.') }}
        </p>
      </template>

      <template v-else>
        <p class="text-sm text-muted">
          {{ props.disabled
            ? t('editor.hintReadOnly', 'Tap a feature to see it.')
            : canDraw ? t('editor.hint', 'Draw with the tools on the left, or tap a feature to edit it.') : t('editor.noKinds', 'No feature kinds may be drawn here.') }}
        </p>
        <UFormField
          v-if="props.grid > 0 && !props.disabled"
          :label="t('editor.snap', 'Snap to grid')"
          :description="t('editor.snapHelp', 'Rounds corners and points to a grid of {size} units.', { size: props.grid })"
        >
          <USwitch v-model="snap" />
        </UFormField>
        <div
          v-if="props.upload && !props.disabled"
          class="flex flex-col gap-2"
        >
          <p class="text-sm font-medium">
            {{ t('editor.underlay', 'Underlay') }}
          </p>
          <p class="text-sm text-muted">
            {{ model.underlay
              ? t('editor.underlaySize', '{width} by {height} pixels, one unit per pixel.', { width: model.underlay.width, height: model.underlay.height })
              : t('editor.underlayHelp', 'A floor plan image to draw on: PNG, JPEG or WebP.') }}
          </p>
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            :accept="UNDERLAY_TYPES.join(',')"
            data-testid="maps-underlay-input"
            @change="onFile"
          >
          <div class="flex flex-wrap gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-image-up"
              :loading="busy"
              :label="model.underlay ? t('editor.replaceUnderlay', 'Replace underlay') : t('editor.uploadUnderlay', 'Upload underlay')"
              @click="fileInput?.click()"
            />
            <UButton
              v-if="model.underlay"
              size="sm"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :label="t('editor.removeUnderlayAction', 'Remove underlay')"
              @click="removeUnderlay"
            />
          </div>
          <p
            v-if="uploadProblem"
            class="text-sm text-error"
          >
            {{ uploadProblem }}
          </p>
        </div>
        <div
          v-if="features.length"
          class="flex flex-col gap-1"
        >
          <p class="text-sm font-medium">
            {{ t('editor.features', 'Features ({count})', { count: features.length }) }}
          </p>
          <ul class="max-h-48 overflow-y-auto">
            <li
              v-for="feature in features"
              :key="feature.id"
            >
              <UButton
                block
                size="sm"
                color="neutral"
                variant="ghost"
                class="justify-start"
                :icon="registeredKinds[feature.kind]?.icon ?? 'i-lucide-map-pin'"
                :label="featureName(feature)"
                @click="select(feature.id)"
              />
            </li>
          </ul>
        </div>
      </template>
    </div>
  </div>
</template>
