<script setup lang="ts">
import type { FeatureGroup, Layer, Map as LeafletMap, Marker, Polygon } from 'leaflet'
import { kinds as registeredKinds, propertySchemas } from '#maps/registry'
import { createMap, featureColor, geometryLayer, geometryOfLayer, isLabelFeature, loadLeafletWithGeoman, locationLayer, pinIcon, placedImageLayer, planeBounds, underlayCorners, underlayLayer } from '../utils/leaflet'
import type { LeafletModule, PlacedImageLayer } from '../utils/leaflet'
import { PLANE_GRID_SIZE, geometryBounds, planeExtentOf, snapGeometry, toolsForGeometries, withPlaneUnderlay } from '../../utils/geometry'
import { haversineMeters, locationBounds } from '../../utils/geo'
import { METRE_GRID_SIZES, bearingDegrees, extentCorners, geometryToGeo, geometryToPlane, gridOf, initialGeoreference, layoutToGeo, placeGeoreference, placedCenter, planeLengthInMetres, planeToGeo, underlayModeOf, underlayOpacityOf } from '../../utils/georeference'
import { UNDERLAY_TYPES, isSameAppPath } from '../../utils/image'
import { cleanPropertyValues, initialPropertyValues, propertyFields } from '../../utils/fields'
import type { MapPropertyField } from '../../utils/fields'
import { newFeatureId } from '../../utils'
import type { GeoPoint, MapFeatureKindInfo, MapGeometryType, MapLocation, PlaneFeature, PlaneFeatureCollection, PlaneGeometry, PlaneGeoreference, PlanePlacement, PlaneUnderlay, PlaneUnderlayMode, Translated } from '../../../types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useAction, useConfirmDialog, useMapsTranslate, useModuleT, useRuntimeConfig, useTemplateRef, watch } from '#imports'

defineOptions({ name: 'MapPlaneEditor' })

// Draws a layout with leaflet-geoman: a plane (`PlaneFeatureCollection` in plane units) with an underlay image and a
// grid, or a `geo` layout drawn on the map tiles. Only the feature kinds in `kinds` may be drawn; every feature gets a
// stable id and a form generated from its kind's zod schema.
//
// With `v-model:placement`, staff also place the plane on the real map (move, turn, scale over the tiles, with the
// site's `location` shown), choose ONE underlay (none, map tiles, floor plan image) with its opacity, and once placed
// snap to a grid in metres. Works on `v-model` only: the module that owns the values saves them (and checks them with
// `validatePlaneLayout` and `planePlacementSchema`).
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
  /** The site the layout belongs to: the map views centre on it and show it while staff place or draw. */
  location?: MapLocation | null
  /** Offer "Draw on the map" (a `geo` layout) while the layout is empty, and converting a placed plane to it. */
  allowGeo?: boolean
}>(), { grid: PLANE_GRID_SIZE, height: '32rem' })

const model = defineModel<PlaneFeatureCollection>({ default: () => ({ type: 'FeatureCollection', features: [] }) })
/** How the plane is placed and shown. Leave it unbound to edit the layout only. */
const placement = defineModel<PlanePlacement | null | undefined>('placement', { default: undefined })
const emit = defineEmits<{ select: [featureId: string | null] }>()

const t = useModuleT('maps')
const tr = useMapsTranslate()
const confirm = useConfirmDialog()
const { busy, run } = useAction()
const config = useRuntimeConfig().public.maps
const maxBytes = Number(config?.maxUnderlayBytes) || 10 * 1024 * 1024
const el = useTemplateRef<HTMLElement>('el')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const failed = ref(false)
const snap = ref(props.grid > 0)

const isGeo = computed(() => model.value?.crs === 'geo')
const canPlace = computed(() => placement.value !== undefined && !isGeo.value)
const georeference = computed<PlaneGeoreference | null>(() => placement.value?.georeference ?? null)
const extent = computed(() => planeExtentOf(model.value))
const underlayMode = computed<PlaneUnderlayMode>(() => isGeo.value ? 'none' : underlayModeOf(model.value, placement.value))
const opacity = computed(() => underlayOpacityOf(placement.value))
const grid = computed(() => gridOf(placement.value, props.grid))
/** Staff are moving, turning or scaling the plane over the map. */
const placing = ref(false)

/** What the canvas shows: the plane, the plane on the map tiles, the handles over the tiles, or a `geo` layout. */
type View = 'plane' | 'tiles' | 'place' | 'geo'
const view = computed<View>(() => {
  if (isGeo.value) return 'geo'
  if (placing.value && canPlace.value) return 'place'
  return underlayMode.value === 'tiles' ? 'tiles' : 'plane'
})
const onMap = computed(() => view.value !== 'plane')
/** A map view with nothing to centre on would open on the world: those ask for the site's location instead. */
const needsLocation = computed(() => onMap.value && !props.location?.point && !georeference.value && !(isGeo.value && model.value.features.length))

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

const metres = (value: number) => t('editor.metres', '{value} m', { value: Math.round(value * 10) / 10 })

/** The selected feature's size in metres: a line's length, a polygon's width and height. Only for placed or geo layouts. */
const selectedSize = computed<string | null>(() => {
  const feature = selected.value
  if (!feature || feature.geometry.type === 'Point') return null
  const toGeo = (position: readonly [number, number]): GeoPoint => {
    const [lng, lat] = isGeo.value ? position : planeToGeo(position, georeference.value!)
    return { lat, lng }
  }
  if (!isGeo.value && !georeference.value) return null
  if (feature.geometry.type === 'LineString') {
    const line = feature.geometry.coordinates
    const length = line.slice(1).reduce((sum, position, index) => sum + haversineMeters(toGeo(line[index]!), toGeo(position)), 0)
    return t('editor.length', 'Length: {length}', { length: metres(length) })
  }
  if (isGeo.value) {
    const bounds = geometryBounds([feature.geometry])!
    const width = haversineMeters({ lat: bounds[0][1], lng: bounds[0][0] }, { lat: bounds[0][1], lng: bounds[1][0] })
    const height = haversineMeters({ lat: bounds[0][1], lng: bounds[0][0] }, { lat: bounds[1][1], lng: bounds[0][0] })
    return t('editor.size', '{width} by {height}', { width: metres(width), height: metres(height) })
  }
  const bounds = geometryBounds([feature.geometry])!
  return t('editor.size', '{width} by {height}', {
    width: metres(planeLengthInMetres(bounds[1][0] - bounds[0][0], placement.value)!),
    height: metres(planeLengthInMetres(bounds[1][1] - bounds[0][1], placement.value)!),
  })
})

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

/** A geometry read from the canvas, in the layout's coordinates: back through the placement on tiles, then snapped. */
function fromCanvas(geometry: PlaneGeometry): PlaneGeometry {
  if (isGeo.value) return geometry
  const plane = view.value === 'tiles' && georeference.value ? geometryToPlane(geometry, georeference.value) : geometry
  return snap.value && grid.value.planeUnits > 0 ? snapGeometry(plane, grid.value.planeUnits) : plane
}

/** A layout geometry in the canvas's coordinates. */
function toCanvas(geometry: PlaneGeometry): PlaneGeometry {
  if (isGeo.value || view.value === 'plane' || !georeference.value) return geometry
  return geometryToGeo(geometry, georeference.value)
}

async function addFeature(shape: string, geometry: PlaneGeometry) {
  const kind = defaultKindFor(shape, geometry.type)
  if (!kind) return
  const load = propertySchemas[kind.id]
  const properties = load ? initialPropertyValues(propertyFields(await load())) : {}
  const feature: PlaneFeature = { type: 'Feature', id: newFeatureId(), kind: kind.id, geometry: fromCanvas(geometry), properties, label: null }
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

// --- Plane or map -----------------------------------------------------------------------------------------------------
const canChooseCrs = computed(() => props.allowGeo && !props.disabled && !features.value.length && !model.value.underlay)

function setCrs(crs: 'plane' | 'geo') {
  if (crs === 'geo') {
    model.value = { type: 'FeatureCollection', crs: 'geo', features: [] }
    placing.value = false
  }
  else {
    model.value = { type: 'FeatureCollection', features: [] }
  }
}

async function convertToGeo() {
  const converted = layoutToGeo(model.value, placement.value)
  if (!converted) return
  const confirmed = await confirm({
    title: t('editor.convertTitle', 'Draw this layout on the map?'),
    description: t('editor.convertDescription', 'Every feature moves to where it lies on the map now. The floor plan image, the plane grid and the placement are dropped. This cannot be turned back into a plane.'),
    confirmText: t('editor.convertAction', 'Convert to a map layout'),
    destructive: true,
  })
  if (!confirmed) return
  model.value = converted
  placement.value = null
  placing.value = false
}

// --- Placement ----------------------------------------------------------------------------------------------------------
function setPlacement(patch: Partial<PlanePlacement>) {
  placement.value = { ...(placement.value ?? {}), ...patch }
}

/** The span a new placement starts with: the site's size, else 200 m. */
function siteSpan(location: MapLocation | null | undefined): number {
  if (!location) return 200
  if (location.radiusMeters) return location.radiusMeters * 2
  if (location.area?.length) {
    const [[south, west], [north, east]] = locationBounds(location)
    return Math.max(50, haversineMeters({ lat: south, lng: west }, { lat: north, lng: east }) / Math.SQRT2)
  }
  return 200
}

function startPlacing() {
  if (!georeference.value && props.location?.point) {
    setPlacement({ georeference: initialGeoreference(extent.value, props.location.point, siteSpan(props.location)) })
  }
  placing.value = true
}

async function removePlacement() {
  const confirmed = await confirm({
    title: t('editor.unplaceTitle', 'Remove the placement on the map?'),
    description: t('editor.unplaceDescription', 'The layout is no longer shown on the map or over the site map. The map tiles underlay and the metre grid turn off. Drawn features stay where they are on the plane.'),
    confirmText: t('editor.unplaceAction', 'Remove placement'),
    destructive: true,
  })
  if (!confirmed) return
  placing.value = false
  setPlacement({ georeference: null, underlayMode: underlayMode.value === 'tiles' ? null : placement.value?.underlayMode ?? null, gridUnit: null, gridSize: null })
}

const centre = computed(() => georeference.value ? placedCenter(model.value, georeference.value) : null)
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits

function setCentre(axis: 'lat' | 'lng', value: number | null | undefined) {
  if (!georeference.value || !centre.value || typeof value !== 'number' || !Number.isFinite(value)) return
  const next = { ...centre.value, [axis]: value }
  if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) return
  setPlacement({ georeference: placeGeoreference(extent.value, next, georeference.value.rotation, georeference.value.metersPerUnit) })
}

function setRotation(value: number | null | undefined) {
  if (!georeference.value || !centre.value || typeof value !== 'number' || !Number.isFinite(value)) return
  setPlacement({ georeference: placeGeoreference(extent.value, centre.value, value, georeference.value.metersPerUnit) })
}

function setScale(value: number | null | undefined) {
  if (!georeference.value || !centre.value || typeof value !== 'number' || !(value > 0)) return
  setPlacement({ georeference: placeGeoreference(extent.value, centre.value, georeference.value.rotation, value) })
}

const planeSize = computed(() => georeference.value
  ? t('editor.size', '{width} by {height}', { width: metres(extent.value.width * georeference.value.metersPerUnit), height: metres(extent.value.height * georeference.value.metersPerUnit) })
  : null)

const underlayItems = computed(() => [
  { label: t('editor.underlayNone', 'None'), value: 'none' },
  { label: t('editor.underlayTiles', 'Map tiles'), value: 'tiles', disabled: !georeference.value },
  { label: t('editor.underlayImage', 'Floor plan image'), value: 'image', disabled: !model.value.underlay },
])

function setUnderlayMode(mode: PlaneUnderlayMode) {
  placing.value = false
  setPlacement({ underlayMode: mode })
}

const gridItems = computed(() => [
  { label: t('editor.gridPlane', '{size} units', { size: props.grid }), value: 'plane' },
  ...METRE_GRID_SIZES.map(size => ({ label: metres(size), value: `metres:${size}`, disabled: !georeference.value })),
])
const gridValue = computed(() => grid.value.unit === 'metres' ? `metres:${grid.value.size}` : 'plane')
function setGrid(value: string) {
  if (value === 'plane') setPlacement({ gridUnit: null, gridSize: null })
  else setPlacement({ gridUnit: 'metres', gridSize: Number(value.split(':')[1]) })
}

// --- Underlay image -----------------------------------------------------------------------------------------------------
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
  if (placement.value !== undefined && underlayMode.value !== 'image') setPlacement({ underlayMode: 'image' })
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
  if (!confirmed) return
  model.value = { ...model.value, type: 'FeatureCollection', underlay: null }
  if (placement.value?.underlayMode === 'image') setPlacement({ underlayMode: null })
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
let mountedView: View | undefined
let group: FeatureGroup | undefined
const background: Layer[] = []
let disposed = false

function render() {
  if (!L || !map) return
  group?.remove()
  for (const layer of background.splice(0)) layer.remove()
  if (onMap.value && props.location?.point) background.push(locationLayer(L, props.location, featureColor('neutral', null)).addTo(map))
  if (view.value === 'plane' && underlayMode.value === 'image' && model.value.underlay && isSameAppPath(model.value.underlay.url)) {
    background.push(underlayLayer(L, model.value.underlay, opacity.value).addTo(map))
  }
  if (view.value === 'tiles' && georeference.value) {
    // The plane's outline on the tiles, so staff see where the plan ends while they draw on the map.
    const outline = extentCorners(extent.value, georeference.value).map(corner => [corner.lat, corner.lng] as [number, number])
    background.push(L.polygon(outline, { pmIgnore: true, interactive: false, color: featureColor('neutral', null), weight: 2, dashArray: '8 6', fill: false } as Record<string, unknown>).addTo(map))
  }
  group = L.featureGroup().addTo(map)
  if (view.value === 'place') {
    renderHandles()
    return
  }
  for (const feature of features.value) {
    const kind = registeredKinds[feature.kind]
    const layer = geometryLayer(L, toCanvas(feature.geometry), {
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
      layer.on('pm:edit', () => updateFeature(feature.id, { geometry: fromCanvas(geometryOfLayer(layer)) }))
    }
    group.addLayer(layer)
  }
}

// The placement handles: the plane's outline and image over the tiles, a centre handle to move it, a handle above it
// to turn it and a corner handle to scale it. Dragging redraws live; the placement is written when the drag ends.
function renderHandles() {
  if (!L || !map || !group || !georeference.value) return
  const Leaflet = L
  let draft = georeference.value
  const outlineOf = (value: PlaneGeoreference) => extentCorners(extent.value, value).map(corner => [corner.lat, corner.lng] as [number, number])
  const at = (position: [number, number], value: PlaneGeoreference): [number, number] => {
    const [lng, lat] = planeToGeo(position, value)
    return [lat, lng]
  }
  const { width, height } = extent.value
  const rotatePoint = (value: PlaneGeoreference) => at([width / 2, height + height * 0.12], value)
  const scalePoint = (value: PlaneGeoreference) => at([width, height], value)
  const centrePoint = (value: PlaneGeoreference) => at([width / 2, height / 2], value)

  let image: PlacedImageLayer | undefined
  if (model.value.underlay && isSameAppPath(model.value.underlay.url)) {
    image = placedImageLayer(Leaflet, model.value.underlay, underlayCorners(model.value.underlay, draft), { opacity: underlayMode.value === 'image' ? opacity.value : 0.6 })
    group.addLayer(image)
  }
  for (const feature of features.value) {
    group.addLayer(geometryLayer(Leaflet, geometryToGeo(feature.geometry, draft), { color: featureColor(feature.properties.color, registeredKinds[feature.kind]?.color), label: featureName(feature), asLabel: isLabelFeature(feature) }))
  }
  const outline = Leaflet.polygon(outlineOf(draft), { pmIgnore: true, interactive: false, color: featureColor('primary', null), weight: 2, dashArray: '8 6', fillOpacity: image ? 0 : 0.08 } as Record<string, unknown>) as Polygon
  group.addLayer(outline)
  const handle = (icon: string, label: string) => Leaflet.divIcon({
    className: 'maps-handle',
    html: `<span title="${label}" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid ${featureColor('primary', null)};box-shadow:0 1px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%);font:600 14px/1 system-ui,sans-serif;color:${featureColor('primary', null)};cursor:grab">${icon}</span>`,
    iconSize: [0, 0],
  })
  const move = Leaflet.marker(centrePoint(draft), { draggable: true, pmIgnore: true, icon: handle('✥', t('editor.handleMove', 'Move')) } as Record<string, unknown>) as Marker
  const turn = Leaflet.marker(rotatePoint(draft), { draggable: true, pmIgnore: true, icon: handle('↻', t('editor.handleRotate', 'Turn')) } as Record<string, unknown>) as Marker
  const scale = Leaflet.marker(scalePoint(draft), { draggable: true, pmIgnore: true, icon: handle('⤢', t('editor.handleScale', 'Scale')) } as Record<string, unknown>) as Marker
  const redraw = (value: PlaneGeoreference, except?: Marker) => {
    draft = value
    outline.setLatLngs(outlineOf(value))
    if (image && model.value.underlay) image.setCorners(underlayCorners(model.value.underlay, value))
    if (except !== move) move.setLatLng(centrePoint(value))
    if (except !== turn) turn.setLatLng(rotatePoint(value))
    if (except !== scale) scale.setLatLng(scalePoint(value))
  }
  const centreOf = () => placedCenter(model.value, draft)
  const halfDiagonalUnits = Math.hypot(width / 2, height / 2)
  move.on('drag', () => {
    const { lat, lng } = move.getLatLng()
    redraw(placeGeoreference(extent.value, { lat, lng }, draft.rotation, draft.metersPerUnit), move)
  })
  turn.on('drag', () => {
    const { lat, lng } = turn.getLatLng()
    redraw(placeGeoreference(extent.value, centreOf(), bearingDegrees(centreOf(), { lat, lng }), draft.metersPerUnit), turn)
  })
  scale.on('drag', () => {
    const { lat, lng } = scale.getLatLng()
    const distance = haversineMeters(centreOf(), { lat, lng })
    redraw(placeGeoreference(extent.value, centreOf(), draft.rotation, distance / halfDiagonalUnits), scale)
  })
  for (const marker of [move, turn, scale]) {
    marker.on('dragend', () => setPlacement({ georeference: draft }))
    group.addLayer(marker)
  }
}

/** Fits the view: the plane, the placed plane, the site's location, or the `geo` layout's features. */
function fit() {
  if (!map) return
  if (view.value === 'plane') {
    map.fitBounds(planeBounds(extent.value), { padding: [16, 16] })
    return
  }
  const points: [number, number][] = []
  if (georeference.value && !isGeo.value) points.push(...extentCorners(extent.value, georeference.value).map(corner => [corner.lat, corner.lng] as [number, number]))
  if (isGeo.value) {
    const bounds = geometryBounds(features.value.map(feature => feature.geometry))
    if (bounds) points.push([bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]])
  }
  if (!points.length && props.location?.point) points.push(...locationBounds(props.location))
  if (!points.length) return
  if (points.length === 2 && points[0]![0] === points[1]![0] && points[0]![1] === points[1]![1]) map.setView(points[0]!, 18)
  else map.fitBounds(points, { padding: [32, 32], maxZoom: 19 })
}

function setupTools() {
  if (!map) return
  const pm = (map as PmMap).pm
  pm.removeControls()
  if (props.disabled || view.value === 'place') return
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

/** (Re)creates the map for the current view: a plane is `CRS.Simple`, everything else the tiles. */
function mount() {
  if (!L || !el.value || needsLocation.value) {
    map?.remove()
    map = undefined
    mountedView = undefined
    return
  }
  map?.remove()
  group = undefined
  background.length = 0
  mountedView = view.value
  map = createMap(L, el.value, { plane: view.value === 'plane', tiles: config?.tiles })
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
}

onMounted(async () => {
  try {
    L = await loadLeafletWithGeoman()
  }
  catch {
    failed.value = true
    return
  }
  if (disposed) return
  await nextTick()
  mount()
})

// A change of view (plane, tiles, placing, geo) or of the location gate remounts the map: its CRS is fixed.
watch(() => [view.value, needsLocation.value], async () => {
  if (!L) return
  await nextTick()
  if (mountedView !== view.value || !map || needsLocation.value) mount()
})
watch([model, placement], () => render(), { deep: true })
watch(() => props.location, () => {
  render()
}, { deep: true })
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
defineExpose({ select, fit, startPlacing })

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
    :data-view="view"
    :data-crs="isGeo ? 'geo' : 'plane'"
  >
    <div
      class="relative overflow-hidden rounded-md border border-default bg-elevated"
      :style="{ height: props.height }"
    >
      <ClientOnly>
        <div class="relative isolate size-full">
          <div
            v-show="!needsLocation"
            ref="el"
            class="size-full"
            data-testid="maps-plane-canvas"
          />
          <div
            v-if="needsLocation"
            class="absolute inset-0 flex items-center justify-center p-6"
            data-testid="maps-needs-location"
          >
            <slot name="no-location">
              <UEmpty
                icon="i-lucide-map-pin-off"
                :title="t('editor.noLocationTitle', 'Where is the site?')"
                :description="t('editor.noLocation', 'Set the location of the site first: the map opens on it.')"
              />
            </slot>
          </div>
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
      <template v-if="view === 'place'">
        <div class="flex items-center justify-between gap-2">
          <p class="font-medium">
            {{ t('editor.placeTitle', 'Place on the map') }}
          </p>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="t('editor.close', 'Close')"
            @click="placing = false"
          />
        </div>
        <p class="text-sm text-muted">
          {{ t('editor.placeHelp', 'Drag the middle handle to move the plan, the top handle to turn it and the corner handle to scale it.') }}
        </p>
        <fieldset
          v-if="georeference && centre"
          :disabled="props.disabled"
          class="grid min-w-0 grid-cols-2 gap-3"
          data-testid="maps-placement-form"
        >
          <UFormField :label="t('editor.latitude', 'Latitude')">
            <UInputNumber
              :model-value="round(centre.lat, 6)"
              :step="0.00001"
              :format-options="{ maximumFractionDigits: 6 }"
              class="w-full"
              @update:model-value="setCentre('lat', $event)"
            />
          </UFormField>
          <UFormField :label="t('editor.longitude', 'Longitude')">
            <UInputNumber
              :model-value="round(centre.lng, 6)"
              :step="0.00001"
              :format-options="{ maximumFractionDigits: 6 }"
              class="w-full"
              @update:model-value="setCentre('lng', $event)"
            />
          </UFormField>
          <UFormField :label="t('editor.rotation', 'Turn (°)')">
            <UInputNumber
              :model-value="round(georeference.rotation, 1)"
              :step="1"
              :min="-180"
              :max="180"
              class="w-full"
              @update:model-value="setRotation($event)"
            />
          </UFormField>
          <UFormField :label="t('editor.scale', 'Metres per unit')">
            <UInputNumber
              :model-value="round(georeference.metersPerUnit, 4)"
              :step="0.01"
              :min="0.001"
              :format-options="{ maximumFractionDigits: 4 }"
              class="w-full"
              @update:model-value="setScale($event)"
            />
          </UFormField>
        </fieldset>
        <p
          v-if="planeSize"
          class="text-sm text-muted"
        >
          {{ t('editor.planeSize', 'The plan covers {size}.', { size: planeSize }) }}
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            v-if="georeference && !props.disabled"
            color="error"
            variant="outline"
            icon="i-lucide-trash-2"
            :label="t('editor.unplaceAction', 'Remove placement')"
            @click="removePlacement"
          />
          <UButton
            color="neutral"
            variant="outline"
            :label="t('editor.done', 'Done')"
            @click="placing = false"
          />
        </div>
      </template>

      <template v-else-if="selected">
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
          <p
            v-if="selectedSize"
            class="text-sm text-muted"
            data-testid="maps-feature-size"
          >
            {{ selectedSize }}
          </p>
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
          v-if="canChooseCrs"
          :label="t('editor.drawOn', 'Draw on')"
          :description="isGeo ? t('editor.drawOnGeoHelp', 'Features are drawn in real coordinates on the map.') : t('editor.drawOnPlaneHelp', 'A plane with its own grid, optionally on a floor plan. You can place it on the map later.')"
        >
          <UFieldGroup>
            <UButton
              :color="isGeo ? 'neutral' : 'primary'"
              :variant="isGeo ? 'outline' : 'soft'"
              icon="i-lucide-grid-3x3"
              :label="t('editor.drawOnPlane', 'A plane')"
              data-testid="maps-crs-plane"
              @click="setCrs('plane')"
            />
            <UButton
              :color="isGeo ? 'primary' : 'neutral'"
              :variant="isGeo ? 'soft' : 'outline'"
              icon="i-lucide-map"
              :label="t('editor.drawOnMap', 'The map')"
              data-testid="maps-crs-geo"
              @click="setCrs('geo')"
            />
          </UFieldGroup>
        </UFormField>

        <div
          v-if="canPlace && !props.disabled"
          class="flex flex-col gap-2"
          data-testid="maps-placement"
        >
          <p class="text-sm font-medium">
            {{ t('editor.placement', 'On the map') }}
          </p>
          <p class="text-sm text-muted">
            {{ georeference
              ? t('editor.placedHelp', 'Placed: {size}, turned {rotation}°.', { size: planeSize ?? '', rotation: round(georeference.rotation, 1) })
              : t('editor.unplacedHelp', 'Place the plan on the map to show it over the site map and to draw on the map tiles.') }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              icon="i-lucide-move"
              :label="georeference ? t('editor.adjustPlacement', 'Adjust placement') : t('editor.placeAction', 'Place on map')"
              data-testid="maps-place"
              @click="startPlacing"
            />
            <UButton
              v-if="georeference && props.allowGeo"
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-map"
              :label="t('editor.convertAction', 'Convert to a map layout')"
              @click="convertToGeo"
            />
          </div>
        </div>

        <div
          v-if="canPlace && !props.disabled"
          class="flex flex-col gap-3"
          data-testid="maps-underlay-picker"
        >
          <UFormField
            :label="t('editor.underlay', 'Underlay')"
            :description="t('editor.underlayPickerHelp', 'One at a time. Map tiles need the placement on the map.')"
          >
            <URadioGroup
              :model-value="underlayMode"
              :items="underlayItems"
              orientation="horizontal"
              @update:model-value="setUnderlayMode($event as PlaneUnderlayMode)"
            />
          </UFormField>
          <UFormField
            v-if="underlayMode !== 'none'"
            :label="t('editor.opacity', 'Opacity: {value}%', { value: Math.round(opacity * 100) })"
          >
            <USlider
              :model-value="opacity"
              :min="0.1"
              :max="1"
              :step="0.05"
              data-testid="maps-underlay-opacity"
              @update:model-value="setPlacement({ underlayOpacity: $event as number })"
            />
          </UFormField>
        </div>

        <UFormField
          v-if="props.grid > 0 && !props.disabled && !isGeo"
          :label="t('editor.snap', 'Snap to grid')"
          :description="grid.unit === 'metres'
            ? t('editor.snapMetresHelp', 'Rounds corners and points to a grid of {size} on the ground.', { size: metres(grid.size) })
            : t('editor.snapHelp', 'Rounds corners and points to a grid of {size} units.', { size: props.grid })"
        >
          <div class="flex flex-wrap items-center gap-3">
            <USwitch v-model="snap" />
            <USelect
              v-if="canPlace"
              :model-value="gridValue"
              :items="gridItems"
              size="sm"
              class="w-32"
              data-testid="maps-grid"
              @update:model-value="setGrid($event as string)"
            />
          </div>
        </UFormField>

        <div
          v-if="props.upload && !props.disabled && !isGeo"
          class="flex flex-col gap-2"
        >
          <p class="text-sm font-medium">
            {{ t('editor.floorPlan', 'Floor plan image') }}
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
