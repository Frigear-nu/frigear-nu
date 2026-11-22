// Leaflet for the maps components: loading it in the browser only, creating geographic and plane maps, and drawing
// features. Leaflet and leaflet-geoman are big and touch `window`, so components call these from `onMounted`, never
// during SSR.
import type * as Leaflet from 'leaflet'
import type { Layer, Map as LeafletMap } from 'leaflet'
import type { MapTilesOptions, PlaneExtent, PlaneFeature, PlaneGeometry, PlaneUnderlay } from '../../../types'
import { openRing, toLatLng } from '../../utils/geometry'

export type LeafletModule = typeof Leaflet

let leaflet: Promise<LeafletModule> | undefined
let geoman: Promise<void> | undefined

/**
 * Leaflet, imported once, with its stylesheet. The stylesheet loads with the script, only on pages that show a map, and
 * before the first map is created, so a map never draws unstyled.
 */
export function loadLeaflet(): Promise<LeafletModule> {
  leaflet ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([module]) => {
    return ((module as unknown as { default?: LeafletModule }).default ?? module) as LeafletModule
  })
  return leaflet
}

/** Leaflet with leaflet-geoman's drawing tools. Geoman's bundle extends the global `L`, so Leaflet is put on `window` first. */
export async function loadLeafletWithGeoman(): Promise<LeafletModule> {
  const L = await loadLeaflet()
  geoman ??= (async () => {
    const global = window as unknown as { L?: LeafletModule }
    global.L ??= L
    await Promise.all([import('@geoman-io/leaflet-geoman-free'), import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css')])
  })()
  await geoman
  return L
}

/** The colours of the palette names features may use, as plain CSS for SVG attributes. */
export const MAP_COLORS: Record<string, string> = {
  primary: '#2563eb',
  neutral: '#64748b',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#0891b2',
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTION = /^(?:rgba?|hsla?)\([\d.]+%?(?:[\s,/]+[\d.]+%?){2,3}\)$/i

/**
 * A colour that is safe to put in SVG attributes and icon styles: a palette name (`primary`, ...), `#hex`, or an
 * `rgb()` / `hsl()` value of plain numbers. Anything else (feature properties come from editors) is `null`.
 */
export function safeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const color = value.trim()
  if (Object.hasOwn(MAP_COLORS, color)) return MAP_COLORS[color]!
  return HEX.test(color) || FUNCTION.test(color) ? color : null
}

/** A colour for a feature: its `properties.color`, else its kind's, else the primary; each only when `safeColor` allows it. */
export function featureColor(propertiesColor: unknown, kindColor: string | null | undefined): string {
  return safeColor(propertiesColor) ?? safeColor(kindColor) ?? MAP_COLORS.primary!
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }

/** Escapes text for the HTML of popups and icons. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ESCAPES[char]!)

/** A map pin in a colour. */
export function pinIcon(L: LeafletModule, color: string) {
  return L.divIcon({
    className: 'maps-pin',
    html: `<span style="display:block;width:18px;height:18px;border-radius:50% 50% 50% 0;background:${escapeHtml(color)};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  })
}

/** A round dot with an optional count, for live layers. */
export function dotIcon(L: LeafletModule, color: string, text?: string) {
  const content = text ? escapeHtml(text) : ''
  return L.divIcon({
    className: 'maps-dot',
    html: `<span style="display:flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:${escapeHtml(color)};color:#fff;font:600 12px/1 system-ui,sans-serif;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);transform:translate(-50%,-50%)">${content}</span>`,
    iconSize: [0, 0],
    popupAnchor: [0, -12],
  })
}

const LABEL_SIZES: Record<string, number> = { small: 12, medium: 15, large: 20 }

/** A text on the map (`maps.label`). */
export function labelIcon(L: LeafletModule, text: string, size: unknown) {
  const px = LABEL_SIZES[String(size)] ?? LABEL_SIZES.medium
  return L.divIcon({
    className: 'maps-label',
    html: `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;font-weight:600;font-size:${px}px;color:#111827;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">${escapeHtml(text)}</span>`,
    iconSize: [0, 0],
  })
}

/** The Leaflet bounds of a plane extent (`[[0, 0], [height, width]]`, `[y, x]`). */
export const planeBounds = (extent: PlaneExtent): [[number, number], [number, number]] => [[0, 0], [extent.height, extent.width]]

/** Creates a map: OpenStreetMap-style tiles for `geo`, Leaflet's `CRS.Simple` for `plane`. */
export function createMap(L: LeafletModule, el: HTMLElement, options: { plane: boolean, tiles?: MapTilesOptions }): LeafletMap {
  const map = L.map(el, {
    crs: options.plane ? L.CRS.Simple : L.CRS.EPSG3857,
    minZoom: options.plane ? -5 : 1,
    maxZoom: options.plane ? 5 : (options.tiles?.maxZoom ?? 19),
    zoomSnap: options.plane ? 0.25 : 1,
    attributionControl: !options.plane,
  })
  if (!options.plane && options.tiles?.url) {
    L.tileLayer(options.tiles.url, { attribution: options.tiles.attribution, maxZoom: options.tiles.maxZoom }).addTo(map)
  }
  return map
}

/** The underlay image of a plane, placed at the origin; geoman leaves it alone. */
export function underlayLayer(L: LeafletModule, underlay: PlaneUnderlay): Layer {
  return L.imageOverlay(underlay.url, planeBounds({ width: underlay.width, height: underlay.height }), { pmIgnore: true } as Record<string, unknown>)
}

/** A Leaflet layer for a plane geometry: a pin (or a label), a line or a polygon. */
export function geometryLayer(
  L: LeafletModule,
  geometry: PlaneGeometry,
  options: { color: string, label?: string, labelSize?: unknown, asLabel?: boolean, editable?: boolean },
): Layer {
  const common = { pmIgnore: !options.editable } as Record<string, unknown>
  if (geometry.type === 'Point') {
    const icon = options.asLabel ? labelIcon(L, options.label ?? '', options.labelSize) : pinIcon(L, options.color)
    return L.marker(toLatLng(geometry.coordinates), { ...common, icon })
  }
  if (geometry.type === 'LineString') {
    return L.polyline(geometry.coordinates.map(toLatLng), { ...common, color: options.color, weight: 4 })
  }
  return L.polygon(geometry.coordinates.map(ring => openRing(ring).map(toLatLng)), { ...common, color: options.color, weight: 2, fillOpacity: 0.25 })
}

/** A feature's geometry as GeoJSON, read back from its Leaflet layer. */
export function geometryOfLayer(layer: Layer): PlaneGeometry {
  return (layer as unknown as { toGeoJSON: () => { geometry: PlaneGeometry } }).toGeoJSON().geometry
}

/** Whether a feature is drawn as a text label rather than a pin. */
export const isLabelFeature = (feature: Pick<PlaneFeature, 'kind' | 'geometry'>) => feature.kind === 'maps.label' && feature.geometry.type === 'Point'
