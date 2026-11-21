// Loads Leaflet (and leaflet-geoman for the editor) in the browser only. Both are big and touch `window`, so components
// call these from `onMounted`, never during SSR.
import type * as Leaflet from 'leaflet'

export type LeafletModule = typeof Leaflet

let leaflet: Promise<LeafletModule> | undefined
let geoman: Promise<void> | undefined

/**
 * Leaflet, imported once, with its stylesheet. The stylesheet loads with the script, only on pages that show a map, and
 * before the first map is created, so a map never draws unstyled.
 */
export function loadLeaflet(): Promise<LeafletModule> {
  leaflet ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([module]) => {
    const L = ((module as unknown as { default?: LeafletModule }).default ?? module) as LeafletModule
    return L
  })
  return leaflet
}

/**
 * Leaflet with leaflet-geoman's drawing tools. Geoman's bundle extends the global `L`, so Leaflet is put on `window`
 * first.
 */
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

/** The colours of the semantic colour names features may use (`properties.color`), as plain CSS for SVG attributes. */
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
