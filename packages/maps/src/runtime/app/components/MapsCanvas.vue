<script setup lang="ts">
import type { Control, FeatureGroup, GeoJSON, Layer, LayerGroup, Map as LeafletMap, Marker, Path } from 'leaflet'
import { featureKinds, layers as providerRegistry } from '#maps/registry'
import { mapHandle } from '../composables/useMap'
import { escapeHtml, featureColor, loadLeaflet, loadLeafletWithGeoman } from '../utils/leaflet'
import type { LeafletModule } from '../utils/leaflet'
import { PLANE_GRID_SIZE, boundsOfGeometries, isGeoView, snapGeometry, toLatLng } from '../../utils/view'
import type { MapDetailDto, MapEditorTool, MapFeatureCollection, MapFeatureDto, MapGeometry, MapLatLng, MapPosition } from '../../../types'
import { $fetch, onBeforeUnmount, onMounted, ref, useMapLinks, useMapsTranslate, useModuleT, useRuntimeConfig, useTemplateRef, watch } from '#imports'

defineOptions({ name: 'MapsCanvas' })

// The Leaflet canvas behind `<MapView>` and `<MapEditor>`. Browser only: the parent renders it inside `<ClientOnly>`,
// and Leaflet (plus leaflet-geoman when `edit`) is imported in `onMounted`. Re-renders every layer when `detail`
// changes, which also drops an unsaved drawing.
const props = defineProps<{
  detail: MapDetailDto
  /** The `map` value the parent was given (key or id): `useMap()` of the same value reaches this canvas. */
  mapKey: string
  /** Keys of the layers shown when the map opens; others start hidden but can be turned on. Default: each layer's own setting. */
  initialLayers?: string[]
  /** A feature to focus once mounted (`?feature=` deep links). */
  focusFeature?: string | null
  /** Turns on the editor (leaflet-geoman) with these tools. */
  edit?: boolean
  tools?: MapEditorTool[]
  /** Snap drawn and edited shapes to the plane grid. */
  snap?: boolean
}>()

const emit = defineEmits<{
  /** A feature was clicked (or focused). */
  select: [featureId: string | null]
  /** A new shape was drawn (edit mode); it stays on the map as a draft until `detail` changes or `discardDraft()`. */
  create: [draft: { shape: string, geometry: MapGeometry }]
  /** A stored feature was moved or reshaped (edit mode). */
  change: [featureId: string, geometry: MapGeometry]
  /** A stored feature was removed with the removal tool (edit mode). The parent confirms and deletes, or refreshes. */
  remove: [featureId: string]
  ready: []
}>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const links = useMapLinks()
const tiles = useRuntimeConfig().public.maps?.tiles
const el = useTemplateRef<HTMLElement>('el')
const failed = ref(false)
const handle = mapHandle(props.mapKey)

type FeatureLayer = Layer & { mapsFeatureId?: string, getLatLng?: () => unknown, getBounds?: () => unknown }

let L: LeafletModule | undefined
let map: LeafletMap | undefined
let underlay: Layer | undefined
let control: Control.Layers | undefined
let draft: Layer | undefined
const groups: Layer[] = []
const featureLayers = new Map<string, { layer: FeatureLayer, group: LayerGroup }>()
const timers: ReturnType<typeof setInterval>[] = []
let disposed = false

const openRing = (ring: MapPosition[]) => ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring
const isPlane = () => props.detail.map.base === 'plane'

function pinIcon(color: string) {
  return L!.divIcon({
    className: 'maps-pin',
    html: `<span style="display:block;width:18px;height:18px;border-radius:50% 50% 50% 0;background:${escapeHtml(color)};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  })
}

const LABEL_SIZES: Record<string, number> = { small: 12, medium: 15, large: 20 }

function labelIcon(text: string, size: unknown) {
  const px = LABEL_SIZES[String(size)] ?? LABEL_SIZES.medium
  return L!.divIcon({
    className: 'maps-label',
    html: `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-weight:600;font-size:${px}px;color:#111827;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">${escapeHtml(text)}</span>`,
    iconSize: [0, 0],
  })
}

function popupHtml(feature: MapFeatureDto): string {
  const kind = featureKinds[feature.featureKind]
  const title = tr(feature.label) || tr(kind?.label) || feature.featureKind
  const description = tr(feature.properties.description as Parameters<typeof tr>[0])
  const link = feature.linkMapId ? links.view(feature.linkMapId) : undefined
  return [
    `<div class="maps-popup" data-feature="${escapeHtml(feature.id)}">`,
    `<strong>${escapeHtml(title)}</strong>`,
    description ? `<p style="margin:.25rem 0 0">${escapeHtml(description)}</p>` : '',
    link ? `<p style="margin:.5rem 0 0"><a href="${escapeHtml(link)}">${escapeHtml(t('view.openLinked', 'Open the linked map'))}</a></p>` : '',
    '</div>',
  ].join('')
}

function toLeaflet(feature: MapFeatureDto, editable: boolean): FeatureLayer {
  const kind = featureKinds[feature.featureKind]
  const color = featureColor(feature.properties.color, kind?.color)
  // leaflet-geoman leaves layers with `pmIgnore` alone: provider layers and layers that are not editable.
  const options = { pmIgnore: !editable } as Record<string, unknown>
  const geometry = feature.geometry
  if (geometry.type === 'Point') {
    const latLng = toLatLng(geometry.coordinates)
    const icon = feature.featureKind === 'maps.label'
      ? labelIcon(tr(feature.label) || tr(kind?.label), feature.properties.size)
      : pinIcon(color)
    return L!.marker(latLng, { ...options, icon }) as FeatureLayer
  }
  if (geometry.type === 'LineString') {
    return L!.polyline(geometry.coordinates.map(toLatLng), { ...options, color, weight: 4 }) as unknown as FeatureLayer
  }
  return L!.polygon(geometry.coordinates.map(ring => openRing(ring).map(toLatLng)), { ...options, color, weight: 2, fillOpacity: 0.25 }) as unknown as FeatureLayer
}

function clear() {
  for (const timer of timers.splice(0)) clearInterval(timer)
  for (const group of groups.splice(0)) group.remove()
  control?.remove()
  control = undefined
  underlay?.remove()
  underlay = undefined
  draft?.remove()
  draft = undefined
  featureLayers.clear()
}

function geometryOf(layer: Layer): MapGeometry {
  const geometry = (layer as unknown as { toGeoJSON: () => { geometry: MapGeometry } }).toGeoJSON().geometry
  return props.snap && isPlane() ? snapGeometry(geometry, PLANE_GRID_SIZE) : geometry
}

function shownAtOpen(key: string, visible: boolean) {
  return props.initialLayers ? props.initialLayers.includes(key) : visible
}

function render() {
  if (!L || !map) return
  clear()
  const detail = props.detail
  if (detail.map.base === 'plane' && detail.map.underlay) {
    underlay = L.imageOverlay(detail.map.underlay.url, detail.map.underlay.bounds, { pmIgnore: true } as Record<string, unknown>).addTo(map)
  }

  const overlays: Record<string, Layer> = {}
  for (const stored of detail.layers) {
    const group: FeatureGroup = L.featureGroup()
    const editable = !!props.edit && stored.editable
    for (const feature of detail.features.filter(candidate => candidate.layerId === stored.id)) {
      const layer = toLeaflet(feature, editable)
      layer.mapsFeatureId = feature.id
      layer.bindPopup(popupHtml(feature))
      layer.on('click', () => emit('select', feature.id))
      if (editable) layer.on('pm:edit', () => emit('change', feature.id, geometryOf(layer)))
      group.addLayer(layer)
      featureLayers.set(feature.id, { layer, group })
    }
    groups.push(group)
    if (shownAtOpen(stored.key, stored.visible)) group.addTo(map)
    overlays[escapeHtml(tr(stored.name) || stored.key)] = group
  }

  for (const provider of detail.providerLayers) {
    // A layer with its own component draws itself (`<MapView>` renders it with the Leaflet map).
    if (providerRegistry[provider.key]?.hasComponent) continue
    const group: GeoJSON = L.geoJSON(undefined, {
      pmIgnore: true,
      pointToLayer: (_feature, latLng) => L!.marker(latLng, { icon: pinIcon(featureColor('info', null)), pmIgnore: true } as Record<string, unknown>),
      style: () => ({ color: featureColor('info', null), weight: 3 }),
      onEachFeature: (feature, layer) => {
        const properties = (feature.properties ?? {}) as Record<string, unknown>
        const title = tr((properties.label ?? properties.name) as Parameters<typeof tr>[0])
        if (title) layer.bindPopup(`<strong>${escapeHtml(title)}</strong>`)
      },
    } as Record<string, unknown>)
    const load = async () => {
      try {
        const collection = await $fetch<MapFeatureCollection>(provider.url)
        if (disposed) return
        group.clearLayers()
        group.addData(collection as unknown as Parameters<GeoJSON['addData']>[0])
      }
      catch {
        // A provider layer that fails stays empty; the stored map still works.
      }
    }
    load()
    if (provider.refreshInterval) timers.push(setInterval(load, provider.refreshInterval * 1000))
    groups.push(group)
    if (shownAtOpen(provider.key, provider.visible)) group.addTo(map)
    overlays[escapeHtml(tr(provider.name) || provider.key)] = group
  }

  if (Object.keys(overlays).length > 1 || detail.providerLayers.length) {
    control = L.control.layers(undefined, overlays, { collapsed: true, position: 'topright' }).addTo(map)
  }
}

function fitBounds() {
  if (!L || !map) return
  const visible = props.detail.features.filter((feature) => {
    const entry = featureLayers.get(feature.id)
    return entry && map!.hasLayer(entry.group)
  })
  const bounds = boundsOfGeometries(visible.map(feature => feature.geometry))
  if (bounds && (bounds[0][0] !== bounds[1][0] || bounds[0][1] !== bounds[1][1])) {
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: isPlane() ? undefined : 18 })
    return
  }
  resetView()
}

function resetView() {
  if (!map) return
  const view = props.detail.map.view
  if (isGeoView(view)) map.setView(view.center, view.zoom)
  else map.fitBounds(view.bounds as [MapLatLng, MapLatLng])
}

function focus(featureId: string): boolean {
  const entry = featureLayers.get(featureId)
  if (!map || !entry) return false
  if (!map.hasLayer(entry.group)) entry.group.addTo(map)
  const layer = entry.layer
  if (typeof layer.getLatLng === 'function') {
    map.setView((layer as unknown as Marker).getLatLng(), Math.max(map.getZoom(), isPlane() ? map.getZoom() : 17))
  }
  else if (typeof layer.getBounds === 'function') {
    map.fitBounds((layer as unknown as Path & { getBounds: () => Parameters<LeafletMap['fitBounds']>[0] }).getBounds(), { padding: [32, 32], maxZoom: isPlane() ? undefined : 18 })
  }
  layer.openPopup()
  emit('select', featureId)
  return true
}

type PmMap = LeafletMap & {
  pm: {
    addControls: (options: Record<string, unknown>) => void
    setGlobalOptions: (options: Record<string, unknown>) => void
  }
}

function setupEditor() {
  if (!L || !map) return
  const pm = (map as PmMap).pm
  const tools = props.tools ?? []
  pm.setGlobalOptions({ markerStyle: { icon: pinIcon(featureColor('primary', null)) }, snappable: true, snapDistance: 12 })
  pm.addControls({
    position: 'topleft',
    drawMarker: tools.includes('marker'),
    drawPolyline: tools.includes('polyline'),
    drawPolygon: tools.includes('polygon'),
    drawRectangle: tools.includes('rectangle'),
    drawText: tools.includes('text'),
    drawCircle: false,
    drawCircleMarker: false,
    cutPolygon: false,
    rotateMode: false,
    editMode: true,
    dragMode: true,
    removalMode: true,
  })
  map.on('pm:create', (event) => {
    const { shape, layer } = event as unknown as { shape: string, layer: Layer }
    draft?.remove()
    draft = layer
    emit('create', { shape, geometry: geometryOf(layer) })
  })
  map.on('pm:remove', (event) => {
    const { layer } = event as unknown as { layer: FeatureLayer }
    if (layer === draft) {
      draft = undefined
      return
    }
    if (layer.mapsFeatureId) emit('remove', layer.mapsFeatureId)
  })
}

/** Removes an unsaved drawing. */
function discardDraft() {
  draft?.remove()
  draft = undefined
}

defineExpose({ focus, fitBounds, discardDraft })

onMounted(async () => {
  try {
    L = props.edit ? await loadLeafletWithGeoman() : await loadLeaflet()
  }
  catch {
    failed.value = true
    return
  }
  if (disposed || !el.value) return
  const plane = isPlane()
  map = L.map(el.value, {
    crs: plane ? L.CRS.Simple : L.CRS.EPSG3857,
    minZoom: plane ? -5 : 1,
    maxZoom: plane ? 5 : (tiles?.maxZoom ?? 19),
    zoomSnap: plane ? 0.25 : 1,
  })
  if (!plane && tiles?.url) L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom }).addTo(map)
  render()
  resetView()
  if (props.edit) setupEditor()
  handle.leaflet.value = map
  handle.controller.value = { focus, fitBounds }
  const pending = props.focusFeature ?? handle.pendingFocus
  handle.pendingFocus = null
  if (pending) focus(pending)
  emit('ready')
})

watch(() => props.detail, () => render())
watch(() => props.focusFeature, (featureId) => {
  if (featureId) focus(featureId)
})

onBeforeUnmount(() => {
  disposed = true
  clear()
  if (handle.leaflet.value === map) {
    handle.leaflet.value = null
    handle.controller.value = null
  }
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
