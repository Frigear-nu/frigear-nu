// Helpers for feature kind property schemas. A properties file is bundled into the app and the server, so this file
// imports nothing but zod.
import { z } from 'zod'
import type { Translated } from '@frigear-nu/ui/translated'

/** The metadata maps reads from a property schema (`.meta({...})`): a label and help text for the editor's form. */
export type MapPropertyMeta = {
  /** The field's label in the editor; the key is shown without one. */
  label?: Translated
  /** Help text under the field (not `description`: zod types that one as a string). */
  help?: Translated
  /** Set by `translatedProperty()`: the value is a text in one or more languages. */
  mapsType?: 'translated'
}

/** Marks the value of a text that may differ per language (`'Bar'` or `{ da: 'Bar', en: 'Bar' }`). */
export const MAPS_TRANSLATED = 'translated'

/**
 * A property holding a translated text: a plain string, or a locale -> text map. The editor shows a translated input
 * for it. Chain `.optional()` as with any zod schema.
 *
 * ```ts
 * import { z } from 'zod'
 * import { translatedProperty } from '@frigear-nu/maps/properties'
 *
 * export default z.object({
 *   description: translatedProperty({ label: { da: 'Beskrivelse', en: 'Description' } }).optional(),
 *   capacity: z.number().int().min(0).meta({ label: 'Capacity' }).optional(),
 * })
 * ```
 */
export function translatedProperty(meta: Omit<MapPropertyMeta, 'mapsType'> = {}) {
  return z.union([z.string().max(2000), z.record(z.string().min(2).max(16), z.string().max(2000))])
    .meta({ ...meta, mapsType: MAPS_TRANSLATED })
}

/** A property schema's metadata, looked up through wrappers such as `.optional()`. */
export function propertyMeta(schema: unknown): MapPropertyMeta {
  let current = schema as { meta?: () => unknown, _zod?: { def?: { innerType?: unknown } } } | undefined
  const merged: MapPropertyMeta = {}
  for (let depth = 0; depth < 6 && current; depth++) {
    const meta = typeof current.meta === 'function' ? current.meta() as MapPropertyMeta | undefined : undefined
    if (meta) {
      merged.label ??= meta.label
      merged.help ??= meta.help
      merged.mapsType ??= meta.mapsType
    }
    current = current._zod?.def?.innerType as typeof current
  }
  return merged
}
