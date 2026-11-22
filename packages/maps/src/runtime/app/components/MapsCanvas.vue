<script setup lang="ts">
import type { FeatureGroup, GeoJSON, Layer, Map as LeafletMap } from 'leaflet'
import { kinds } from '#maps/registry'
import { createMap, dotIcon, escapeHtml, featureColor, geometryLayer, isLabelFeature, loadLeaflet, planeBounds, underlayLayer } from '../utils/leaflet'
import type { LeafletModule } from '../utils/leaflet'
import type { MapLiveLayer } from '../composables/useMapLiveLayers'
import { geometryAnchor, planeExtentOf } from '../../utils/geometry'
import { DEFAULT_GEO_CENTER, geoBounds, locationBounds } from '../../utils/geo'
import type { MapSelection, MapViewerLocation, PlaneFeature, PlaneFeatureCollection, Translated } from '../../../types'
import { onBeforeUnmount, onMounted, ref, useMapsTranslate, useModuleT, useRuntimeConfig, useTemplateRef, watch } from '#imports'

defineOptions({ name: 'MapsCanvas' })

// The read-only Leaflet canvas behind `<MapViewer>` and `<MapMobileViewer>`: a plane layout (`layout`) or geographic
// locations (`locations`), plus the live layers the parent fetched. Browser only: the parent renders it inside
// `<ClientOnly>`, and Leaflet is imported in `onMounted`.
const props = defineProps<{
  layout?: PlaneFeatureCollection | null
  locations?: MapViewerLocation[]
  liveLayers?: MapLiveLayer[]
  /** Ids of live layers that are turned off. */
  hiddenLayers?: string[]
  /** A feature or location id to focus. */
  focus?: string | null
}>()

const emit = defineEmits<{ select: [selection: MapSelection | null] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const config = useRuntimeConfig().public.maps
const el = useTemplateRef<HTMLElement>('el')
const failed = ref(false)

let L: LeafletModule | undefined
let map: LeafletMap | undefined
let content: FeatureGroup | undefined
let underlay: Layer | undefined
const live = new Map<string, GeoJSON>()
const targets = new Map<string, Layer & { getLatLng?: () => unknown, getBounds?: () => unknown, openPopup?: () => void }>()
let disposed = false

const isPlane = () => !!props.layout

function title(label: Translated | null | undefined, fallback: string) {
  return tr(label) || fallback
}

function selectFeature(feature: PlaneFeature) {
  emit('select', { source: 'feature', id: feature.id, kind: feature.kind, label: feature.label ?? null, properties: feature.properties })
}

function renderContent() {
  if (!L || !map) return
  content?.remove()
  underlay?.remove()
  underlay = undefined
  targets.clear()
  content = L.featureGroup().addTo(map)
  if (props.layout) {
    if (props.layout.underlay) underlay = underlayLayer(L, props.layout.underlay).addTo(map)
    for (const feature of props.layout.features) {
      const kind = kinds[feature.kind]
      const label = title(feature.label, tr(kind?.label) || feature.kind)
      const layer = geometryLayer(L, feature.geometry, {
        color: featureColor(feature.properties.color, kind?.color),
        label,
        labelSize: feature.properties.size,
        asLabel: isLabelFeature(feature),
      })
      layer.bindPopup(`<strong>${escapeHtml(label)}</strong>`)
      layer.on('click', (event) => {
        L!.DomEvent.stopPropagation(event)
        selectFeature(feature)
      })
      content.addLayer(layer)
      targets.set(feature.id, layer)
    }
    return
  }
  for (const entry of props.locations ?? []) {
    const color = featureColor(entry.color, null)
    const label = title(entry.label, '')
    const group = L.featureGroup()
    if (entry.location.area?.length) {
      group.addLayer(L.polygon(entry.location.area.map(point => [point.lat, point.lng] as [number, number]), { color, weight: 2, fillOpacity: 0.2 }))
    }
    else if (entry.location.radiusMeters) {
      group.addLayer(L.circle([entry.location.point.lat, entry.location.point.lng], { radius: entry.location.radiusMeters, color, weight: 2, fillOpacity: 0.15 }))
    }
    group.addLayer(geometryLayer(L, { type: 'Point', coordinates: [entry.location.point.lng, entry.location.point.lat] }, { color }))
    if (label) group.bindPopup(`<strong>${escapeHtml(label)}</strong>`)
    group.on('click', (event) => {
      L!.DomEvent.stopPropagation(event)
      emit('select', { source: 'location', id: entry.id, label: entry.label ?? null, properties: {} })
    })
    content.addLayer(group)
    targets.set(entry.id, group)
  }
}

function renderLive() {
  if (!L || !map) return
  const wanted = new Set((props.liveLayers ?? []).map(layer => layer.id))
  for (const [id, group] of live) {
    if (!wanted.has(id)) {
      group.remove()
      live.delete(id)
    }
  }
  for (const layer of props.liveLayers ?? []) {
    let group = live.get(layer.id)
    if (!group) {
      const color = featureColor(layer.color ?? 'info', null)
      group = L.geoJSON(undefined, {
        pointToLayer: (feature, latLng) => {
          const count = (feature.properties as Record<string, unknown> | null)?.count
          return L!.marker(latLng, { icon: dotIcon(L!, color, typeof count === 'number' ? String(count) : undefined) })
        },
        style: () => ({ color, weight: 3 }),
        onEachFeature: (feature, leafletLayer) => {
          const properties = (feature.properties ?? {}) as Record<string, unknown>
          const label = tr((properties.label ?? properties.name) as Translated | undefined)
          if (label) leafletLayer.bindPopup(`<strong>${escapeHtml(label)}</strong>`)
          leafletLayer.on('click', (event) => {
            L!.DomEvent.stopPropagation(event)
            emit('select', {
              source: 'live',
              id: String(feature.id ?? ''),
              layer: layer.id,
              label: (properties.label ?? properties.name ?? null) as Translated | null,
              properties,
            })
          })
        },
      })
      live.set(layer.id, group)
    }
    group.clearLayers()
    // Draw what is valid on this surface: anything else is dropped rather than breaking the map.
    const features = (layer.collection?.features ?? []).filter(feature => geometryAnchor(feature?.geometry) !== null)
    group.addData({ type: 'FeatureCollection', features } as Parameters<GeoJSON['addData']>[0])
    const hidden = props.hiddenLayers?.includes(layer.id)
    if (hidden && map.hasLayer(group)) group.remove()
    if (!hidden && !map.hasLayer(group)) group.addTo(map)
  }
}

/** Fits the view to the layout's plane, or to the locations (the default centre without any). */
function fit() {
  if (!map) return
  if (props.layout) {
    map.fitBounds(planeBounds(planeExtentOf(props.layout)), { padding: [16, 16] })
    return
  }
  const bounds = (props.locations ?? []).map(entry => locationBounds(entry.location))
  const all = geoBounds(bounds.flatMap(([[south, west], [north, east]]) => [{ lat: south, lng: west }, { lat: north, lng: east }]))
  if (!all) {
    map.setView((config?.defaultCenter?.center ?? DEFAULT_GEO_CENTER.center) as [number, number], config?.defaultCenter?.zoom ?? DEFAULT_GEO_CENTER.zoom)
    return
  }
  if (all[0][0] === all[1][0] && all[0][1] === all[1][1]) map.setView(all[0], 17)
  else map.fitBounds(all, { padding: [24, 24], maxZoom: 18 })
}

/** Centres on a feature or location and opens its popup. */
function focusOn(id: string): boolean {
  const target = targets.get(id)
  if (!map || !target) return false
  if (typeof target.getBounds === 'function') {
    map.fitBounds(target.getBounds() as Parameters<LeafletMap['fitBounds']>[0], { padding: [32, 32], maxZoom: isPlane() ? undefined : 18 })
  }
  else if (typeof target.getLatLng === 'function') {
    map.setView(target.getLatLng() as [number, number], Math.max(map.getZoom(), isPlane() ? map.getZoom() : 17))
  }
  target.openPopup?.()
  const feature = props.layout?.features.find(candidate => candidate.id === id)
  if (feature) selectFeature(feature)
  return true
}

defineExpose({ fit, focus: focusOn })

onMounted(async () => {
  try {
    L = await loadLeaflet()
  }
  catch {
    failed.value = true
    return
  }
  if (disposed || !el.value) return
  map = createMap(L, el.value, { plane: isPlane(), tiles: config?.tiles })
  map.on('click', () => emit('select', null))
  renderContent()
  renderLive()
  fit()
  if (props.focus) focusOn(props.focus)
})

watch(() => [props.layout, props.locations], () => renderContent(), { deep: true })
watch(() => [props.liveLayers, props.hiddenLayers], () => renderLive())
watch(() => props.focus, (id) => {
  if (id) focusOn(id)
})

onBeforeUnmount(() => {
  disposed = true
  map?.remove()
  map = undefined
})
</script>

<template>
  <div class="relative isolate size-full">
    <div
      ref="el"
      class="size-full"
      data-testid="maps-canvas"
    />
    <div
      v-if="failed"
      class="absolute inset-0 flex items-center justify-center bg-elevated text-sm text-muted"
    >
      {{ t('view.loadFailed', 'The map could not be loaded.') }}
    </div>
  </div>
</template>
