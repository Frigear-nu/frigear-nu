<script setup lang="ts">
import type { Circle, LatLng, Map as LeafletMap, Marker, Polygon } from 'leaflet'
import { createMap, featureColor, loadLeafletWithGeoman, pinIcon } from '../utils/leaflet'
import type { LeafletModule } from '../utils/leaflet'
import { DEFAULT_GEO_CENTER, areaCentroid, locationBounds } from '../../utils/geo'
import type { GeoPoint, MapLocation, MapLocationMode } from '../../../types'
import { computed, onBeforeUnmount, onMounted, ref, useModuleT, useRuntimeConfig, useTemplateRef, watch } from '#imports'

defineOptions({ name: 'MapLocationField' })

// A form field for a geographic location (`MapLocation`) on OpenStreetMap tiles: tap the map to place the point, drag
// it to move it, and give it a radius or draw an area around it. Works on `v-model` only; put it in a `UFormField`.
const props = withDefaults(defineProps<{
  /** The kinds of location offered. Default: all three. */
  modes?: MapLocationMode[]
  /** The radius a new circle starts with, in metres. */
  defaultRadius?: number
  /** The map's height (any CSS length). */
  height?: string
  disabled?: boolean
}>(), { modes: () => ['point', 'radius', 'area'], defaultRadius: 100, height: '20rem' })

const model = defineModel<MapLocation | null | undefined>({ default: null })

const t = useModuleT('maps')
const config = useRuntimeConfig().public.maps
const el = useTemplateRef<HTMLElement>('el')
const failed = ref(false)

const modeOf = (value: MapLocation | null | undefined): MapLocationMode => value?.area?.length ? 'area' : value?.radiusMeters ? 'radius' : 'point'
const mode = ref<MapLocationMode>(modeOf(model.value))
watch(model, (value) => {
  if (value) mode.value = modeOf(value)
})
const modeItems = computed(() => props.modes.map(value => ({
  value,
  label: value === 'point' ? t('location.point', 'Point') : value === 'radius' ? t('location.radius', 'Radius') : t('location.area', 'Area'),
  icon: value === 'point' ? 'i-lucide-map-pin' : value === 'radius' ? 'i-lucide-circle-dot' : 'i-lucide-pentagon',
})))

const radius = computed({
  get: () => model.value?.radiusMeters ?? props.defaultRadius,
  set: (value: number | null | undefined) => {
    if (!model.value || !value || value <= 0) return
    model.value = { point: model.value.point, radiusMeters: Math.round(value) }
  },
})

const round = (value: number) => Math.round(value * 1e6) / 1e6
const toPoint = (latLng: LatLng): GeoPoint => ({ lat: round(latLng.lat), lng: round(latLng.lng) })
const readout = computed(() => model.value ? `${model.value.point.lat.toFixed(5)}, ${model.value.point.lng.toFixed(5)}` : '')

let L: LeafletModule | undefined
let map: LeafletMap | undefined
let marker: Marker | undefined
let circle: Circle | undefined
let polygon: Polygon | undefined
let disposed = false

type PmMap = LeafletMap & { pm: { enableDraw: (shape: string, options?: Record<string, unknown>) => void, disableDraw: () => void, setGlobalOptions: (options: Record<string, unknown>) => void } }
type PmLayer = { pm: { enable: (options?: Record<string, unknown>) => void } }

function setPoint(point: GeoPoint) {
  if (props.disabled) return
  if (mode.value === 'area') return
  model.value = mode.value === 'radius' ? { point, radiusMeters: model.value?.radiusMeters ?? props.defaultRadius } : { point }
}

function setArea(corners: GeoPoint[]) {
  if (corners.length < 3) return
  model.value = { point: areaCentroid(corners), area: corners }
}

function cornersOf(layer: Polygon): GeoPoint[] {
  const rings = layer.getLatLngs() as LatLng[][]
  return (rings[0] ?? []).map(toPoint)
}

function startDrawing() {
  if (!map || props.disabled) return
  const pm = (map as PmMap).pm
  pm.disableDraw()
  if (mode.value === 'area' && !model.value?.area?.length) {
    pm.enableDraw('Polygon', { pathOptions: { color: featureColor('primary', null) } })
  }
}

function render() {
  if (!L || !map) return
  marker?.remove()
  circle?.remove()
  polygon?.remove()
  marker = circle = polygon = undefined
  const value = model.value
  if (!value) {
    startDrawing()
    return
  }
  const color = featureColor('primary', null)
  const latLng: [number, number] = [value.point.lat, value.point.lng]
  if (value.area?.length) {
    polygon = L.polygon(value.area.map(point => [point.lat, point.lng] as [number, number]), { color, weight: 2, fillOpacity: 0.2 }).addTo(map)
    if (!props.disabled) {
      (polygon as unknown as PmLayer).pm.enable({ allowSelfIntersection: false })
      polygon.on('pm:edit', () => setArea(cornersOf(polygon!)))
    }
  }
  else if (value.radiusMeters) {
    circle = L.circle(latLng, { radius: value.radiusMeters, color, weight: 2, fillOpacity: 0.15, pmIgnore: true } as Record<string, unknown> & { radius: number }).addTo(map)
  }
  marker = L.marker(latLng, { icon: pinIcon(L, color), draggable: !props.disabled, pmIgnore: true } as Record<string, unknown>).addTo(map)
  marker.on('dragend', () => {
    const point = toPoint(marker!.getLatLng())
    model.value = model.value ? { ...model.value, point } : { point }
  })
  startDrawing()
}

function fit() {
  if (!map) return
  if (model.value) {
    const bounds = locationBounds(model.value)
    if (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]) map.setView(bounds[0], Math.max(map.getZoom() || 0, 16))
    else map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 })
    return
  }
  map.setView((config?.defaultCenter?.center ?? DEFAULT_GEO_CENTER.center) as [number, number], config?.defaultCenter?.zoom ?? DEFAULT_GEO_CENTER.zoom)
}

function setMode(next: MapLocationMode) {
  if (props.disabled || next === mode.value) return
  mode.value = next
  const value = model.value
  if (!value) {
    render()
    return
  }
  if (next === 'point') model.value = { point: value.point }
  else if (next === 'radius') model.value = { point: value.point, radiusMeters: value.radiusMeters ?? props.defaultRadius }
  // An area is drawn anew: keep the point until the polygon is finished.
  else model.value = value.area?.length ? value : { point: value.point }
  render()
}

function clear() {
  model.value = null
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
  map = createMap(L, el.value, { plane: false, tiles: config?.tiles })
  ;(map as PmMap).pm.setGlobalOptions({ snappable: false })
  map.on('click', event => setPoint(toPoint((event as unknown as { latlng: LatLng }).latlng)))
  map.on('pm:create', (event) => {
    const { layer } = event as unknown as { layer: Polygon }
    const corners = cornersOf(layer)
    layer.remove()
    setArea(corners)
  })
  // The view first: geoman places its vertex handles only on a map that has one.
  fit()
  render()
})

// Redraw on outside changes; the field's own edits redraw too, which keeps the handles in step with the value.
watch(model, () => render(), { deep: true })
watch(() => props.disabled, () => render())

onBeforeUnmount(() => {
  disposed = true
  map?.remove()
  map = undefined
})
</script>

<template>
  <div
    class="flex flex-col gap-2"
    data-maps-location-field
    :data-mode="mode"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <UFieldGroup v-if="props.modes.length > 1">
        <UButton
          v-for="item in modeItems"
          :key="item.value"
          size="sm"
          :icon="item.icon"
          :label="item.label"
          :color="mode === item.value ? 'primary' : 'neutral'"
          :variant="mode === item.value ? 'soft' : 'outline'"
          :aria-pressed="mode === item.value"
          :disabled="props.disabled"
          :data-mode="item.value"
          @click="setMode(item.value)"
        />
      </UFieldGroup>
      <UButton
        v-if="model && !props.disabled"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        :label="t('location.clear', 'Clear location')"
        @click="clear"
      />
    </div>
    <div
      class="relative overflow-hidden rounded-md border border-default bg-elevated"
      :style="{ height: props.height }"
    >
      <ClientOnly>
        <div class="relative isolate size-full">
          <div
            ref="el"
            class="size-full"
            data-testid="maps-location-canvas"
          />
          <div
            v-if="failed"
            class="absolute inset-0 flex items-center justify-center text-sm text-muted"
          >
            {{ t('view.loadFailed', 'The map could not be loaded.') }}
          </div>
        </div>
        <template #fallback>
          <USkeleton class="size-full rounded-none" />
        </template>
      </ClientOnly>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span v-if="model">{{ readout }}</span>
      <span v-else>{{ mode === 'area' ? t('location.drawArea', 'Draw the area on the map, corner by corner.') : t('location.tap', 'Tap the map to place the location.') }}</span>
      <div
        v-if="mode === 'radius' && model"
        class="flex items-center gap-2"
      >
        <span>{{ t('location.radiusLabel', 'Radius (m)') }}</span>
        <UInputNumber
          v-model="radius"
          :min="1"
          :max="50000"
          :step="10"
          size="sm"
          class="w-32"
          :disabled="props.disabled"
          :aria-label="t('location.radiusLabel', 'Radius (m)')"
        />
      </div>
      <span v-else-if="mode === 'area' && model?.area?.length">{{ t('location.corners', '{count} corners', { count: model.area.length }) }}</span>
    </div>
  </div>
</template>
