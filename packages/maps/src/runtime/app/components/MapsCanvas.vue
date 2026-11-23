<script setup lang="ts">
import type { FeatureGroup, GeoJSON, Layer, Map as LeafletMap } from 'leaflet'
import { kinds } from '#maps/registry'
import { createMap, dotIcon, escapeHtml, featureColor, geometryLayer, isLabelFeature, loadLeaflet, placedImageLayer, planeBounds, underlayCorners, underlayLayer } from '../utils/leaflet'
import type { LeafletModule } from '../utils/leaflet'
import type { MapLiveLayer } from '../composables/useMapLiveLayers'
import { geometryAnchor, geometryPositions, planeExtentOf } from '../../utils/geometry'
import { DEFAULT_GEO_CENTER, geoBounds, locationBounds } from '../../utils/geo'
import { canvasBase, geometryToGeo, isGeoLayout, layoutToGeo, underlayModeOf, underlayOpacityOf } from '../../utils/georeference'
import { isSameAppPath } from '../../utils/image'
import type { MapSelection, MapViewerLocation, MapViewerOverlay, PlaneFeature, PlaneFeatureCollection, PlaneGeometry, PlaneGeoreference, PlanePlacement, Translated } from '../../../types'
import { onBeforeUnmount, onMounted, ref, useMapsTranslate, useModuleT, useRuntimeConfig, useTemplateRef, watch } from '#imports'

defineOptions({ name: 'MapsCanvas' })

// The read-only Leaflet canvas behind `<MapViewer>` and `<MapMobileViewer>`. It is a plane (`CRS.Simple`) for a plane
// layout, and a geographic map with tiles for locations, overlays, a `geo` layout, or a placed plane layout shown on
// map tiles (`placement.underlayMode: 'tiles'`). Browser only: the parent renders it inside `<ClientOnly>`, and
// Leaflet is imported in `onMounted`.
const props = defineProps<{
  layout?: PlaneFeatureCollection | null
  /** The plane layout's placement: its underlay, and where it lies when shown on tiles. */
  placement?: PlanePlacement | null
  locations?: MapViewerLocation[]
  /** Layouts drawn over the geographic map (placed plane layouts and `geo` layouts). */
  overlays?: MapViewerOverlay[]
  /** Ids of overlays that are turned off. */
  hiddenOverlays?: string[]
  liveLayers?: MapLiveLayer[]
  /** Ids of live layers that are turned off. */
  hiddenLayers?: string[]
  /** Live layers return plane positions: place them through this georeference (a placed plane on a geographic map). */
  liveGeoreference?: PlaneGeoreference | null
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
const background: Layer[] = []
const live = new Map<string, GeoJSON>()
const targets = new Map<string, Layer & { getLatLng?: () => unknown, getBounds?: () => unknown, openPopup?: () => void }>()
let disposed = false

/** Whether the canvas is a plane (`CRS.Simple`); the viewers key it on `canvasBase`, so this is fixed per mount. */
const isPlane = () => canvasBase(props.layout, props.placement) === 'plane'

function title(label: Translated | null | undefined, fallback: string) {
  return tr(label) || fallback
}

function selectFeature(feature: PlaneFeature, overlay?: string) {
  emit('select', { source: 'feature', id: feature.id, kind: feature.kind, label: feature.label ?? null, properties: feature.properties, ...(overlay ? { overlay } : {}) })
}

/** The layout's features in the canvas's coordinates: as stored on a plane, placed through the georeference on tiles. */
function layoutGeometry(geometry: PlaneGeometry): PlaneGeometry {
  const georeference = props.placement?.georeference
  if (isPlane() || isGeoLayout(props.layout) || !georeference) return geometry
  return geometryToGeo(geometry, georeference)
}

function featureLayer(feature: PlaneFeature, geometry: PlaneGeometry, opacity = 1): Layer {
  const kind = kinds[feature.kind]
  const label = title(feature.label, tr(kind?.label) || feature.kind)
  const layer = geometryLayer(L!, geometry, {
    color: featureColor(feature.properties.color, kind?.color),
    label,
    labelSize: feature.properties.size,
    asLabel: isLabelFeature(feature),
  })
  if (opacity < 1) {
    const styled = layer as Layer & { setStyle?: (style: Record<string, number>) => void, setOpacity?: (value: number) => void }
    if (styled.setStyle) styled.setStyle({ opacity, fillOpacity: 0.25 * opacity })
    else styled.setOpacity?.(opacity)
  }
  layer.bindPopup(`<strong>${escapeHtml(label)}</strong>`)
  return layer
}

function renderContent() {
  if (!L || !map) return
  content?.remove()
  for (const layer of background.splice(0)) layer.remove()
  targets.clear()
  content = L.featureGroup().addTo(map)
  const layout = props.layout
  if (layout) {
    const mode = isGeoLayout(layout) ? 'none' : underlayModeOf(layout, props.placement)
    if (isPlane() && mode === 'image' && layout.underlay && isSameAppPath(layout.underlay.url)) {
      background.push(underlayLayer(L, layout.underlay, underlayOpacityOf(props.placement)).addTo(map))
    }
    for (const feature of layout.features) {
      const layer = featureLayer(feature, layoutGeometry(feature.geometry))
      layer.on('click', (event) => {
        L!.DomEvent.stopPropagation(event)
        selectFeature(feature)
      })
      content.addLayer(layer)
      targets.set(feature.id, layer)
    }
  }
  if (isPlane()) return
  for (const overlay of props.overlays ?? []) {
    if (props.hiddenOverlays?.includes(overlay.id)) continue
    const placed = layoutToGeo(overlay.layout, overlay.placement)
    if (!placed) continue
    const georeference = overlay.placement?.georeference
    const image = overlay.layout.underlay
    if (overlay.image !== false && georeference && image && isSameAppPath(image.url) && underlayModeOf(overlay.layout, overlay.placement) === 'image') {
      background.push(placedImageLayer(L, image, underlayCorners(image, georeference), { opacity: underlayOpacityOf(overlay.placement) }).addTo(map))
    }
    const opacity = Math.min(1, Math.max(0.1, overlay.opacity ?? 1))
    for (const feature of placed.features) {
      const layer = featureLayer(feature, feature.geometry, opacity)
      layer.on('click', (event) => {
        L!.DomEvent.stopPropagation(event)
        selectFeature(feature, overlay.id)
      })
      content.addLayer(layer)
      targets.set(`${overlay.id}:${feature.id}`, layer)
    }
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
          // A live route may send any JSON: a label that is not text (`{ en: 5 }`) is shown as text, never thrown on.
          const raw = tr((properties.label ?? properties.name) as Translated | undefined) as unknown
          const label = raw === null || raw === undefined ? '' : String(raw)
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
    // Draw what is valid on this surface: anything else is dropped rather than breaking the map. Plane positions on a
    // geographic map go through the placement.
    const georeference = isPlane() ? null : props.liveGeoreference
    const features = (layer.collection?.features ?? [])
      .filter(feature => geometryAnchor(feature?.geometry) !== null)
      .map(feature => georeference ? { ...feature, geometry: geometryToGeo(feature.geometry, georeference) } : feature)
    group.addData({ type: 'FeatureCollection', features } as Parameters<GeoJSON['addData']>[0])
    const hidden = props.hiddenLayers?.includes(layer.id)
    if (hidden && map.hasLayer(group)) group.remove()
    if (!hidden && !map.hasLayer(group)) group.addTo(map)
  }
}

/** Every `[lng, lat]` the geographic canvas shows, for fitting the view. */
function geoPoints() {
  const points: { lat: number, lng: number }[] = []
  for (const entry of props.locations ?? []) {
    const [[south, west], [north, east]] = locationBounds(entry.location)
    points.push({ lat: south, lng: west }, { lat: north, lng: east })
  }
  const add = (geometry: PlaneGeometry) => {
    for (const [lng, lat] of geometryPositions(geometry)) points.push({ lat, lng })
  }
  for (const feature of props.layout?.features ?? []) add(layoutGeometry(feature.geometry))
  for (const overlay of props.overlays ?? []) {
    if (props.hiddenOverlays?.includes(overlay.id)) continue
    for (const feature of layoutToGeo(overlay.layout, overlay.placement)?.features ?? []) add(feature.geometry)
  }
  return points
}

/** What `fit()` fits to; a content change refits only when it changes. */
function boundsKey(): string {
  if (isPlane()) return JSON.stringify(planeExtentOf(props.layout))
  return JSON.stringify(geoBounds(geoPoints()))
}
let fitted: string | undefined

/** Fits the view to the layout's plane, or to everything on the geographic map (the default centre without anything). */
function fit() {
  if (!map) return
  fitted = boundsKey()
  if (isPlane()) {
    map.fitBounds(planeBounds(planeExtentOf(props.layout)), { padding: [16, 16] })
    return
  }
  const all = geoBounds(geoPoints())
  if (!all) {
    map.setView((config?.defaultCenter?.center ?? DEFAULT_GEO_CENTER.center) as [number, number], config?.defaultCenter?.zoom ?? DEFAULT_GEO_CENTER.zoom)
    return
  }
  if (all[0][0] === all[1][0] && all[0][1] === all[1][1]) map.setView(all[0], 17)
  else map.fitBounds(all, { padding: [24, 24], maxZoom: 19 })
}

/** Centres on a feature or location (an overlay's feature is `<overlay>:<feature>`) and opens its popup. */
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

// The CRS (plane or geographic) is chosen at mount: the viewers key this canvas on it, so switching remounts.
watch(() => [props.layout, props.placement, props.locations, props.overlays, props.hiddenOverlays], () => {
  renderContent()
  if (map && boundsKey() !== fitted) fit()
}, { deep: true })
watch(() => [props.liveLayers, props.hiddenLayers, props.liveGeoreference], () => renderLive())
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
