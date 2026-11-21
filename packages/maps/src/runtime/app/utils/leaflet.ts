// Loads Leaflet (and leaflet-geoman for the editor) in the browser only. Both are big and touch `window`, so components
// call these from `onMounted`, never during SSR.
import type * as Leaflet from 'leaflet'

export type LeafletModule = typeof Leaflet

let leaflet: Promise<LeafletModule> | undefined
let geoman: Promise<void> | undefined

/** Leaflet, imported once. */
export function loadLeaflet(): Promise<LeafletModule> {
  leaflet ??= import('leaflet').then((module) => {
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
    await import('@geoman-io/leaflet-geoman-free')
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

/** A colour for a feature: its `properties.color` (a semantic name or a CSS colour), its kind's, or the primary. */
export function featureColor(propertiesColor: unknown, kindColor: string | null | undefined): string {
  if (typeof propertiesColor === 'string' && propertiesColor) return MAP_COLORS[propertiesColor] ?? propertiesColor
  if (kindColor) return MAP_COLORS[kindColor] ?? kindColor
  return MAP_COLORS.primary!
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }

/** Escapes text for the HTML of popups and icons. */
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ESCAPES[char]!)
