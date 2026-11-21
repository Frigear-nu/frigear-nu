import type { MapKindDefinition } from '@frigear-nu/maps/utils'

// The map kinds operations adds when `@frigear-nu/maps` is installed (registered with `extendMaps` in `module.ts`).
// Pure data, so the module, the plugin and the tests share the ids.

/** The built-in feature kinds of maps: markers, lines, areas and labels. */
const FEATURE_KINDS = ['maps.marker', 'maps.line', 'maps.area', 'maps.label']

export const OPERATIONS_SITE_KIND = 'operations.site'
export const OPERATIONS_VENUE_KIND = 'operations.venue-layout'

export const operationsMapKinds: MapKindDefinition[] = [
  {
    id: OPERATIONS_SITE_KIND,
    label: { da: 'Områdekort', en: 'Site map' },
    base: 'geo',
    ownerType: 'operation',
    featureKinds: FEATURE_KINDS,
    editorTools: ['marker', 'polyline', 'polygon', 'rectangle', 'text'],
  },
  {
    id: OPERATIONS_VENUE_KIND,
    label: { da: 'Plantegning', en: 'Venue layout' },
    base: 'plane',
    ownerType: 'operation',
    featureKinds: FEATURE_KINDS,
    editorTools: ['marker', 'polyline', 'polygon', 'rectangle', 'text', 'snapGrid'],
  },
]

/** The key of an operation's map of a kind (`operation-<id>-site`, `operation-<id>-venue`). */
export const operationMapKey = (operationId: string, map: 'site' | 'venue') => `operation-${operationId}-${map}`
