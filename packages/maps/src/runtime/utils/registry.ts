// Builds and validates the maps registry (feature kinds and live layers) from what modules registered with
// `extendMaps`. Pure, so it is unit tested; `module.ts` calls it once every module is done and fails the build on an
// issue.
import type { MapFeatureKindDefinition, MapFeatureKindInfo, MapLayerDefinition, MapLayerInfo, MapsExtension } from '../../types'
import { MAP_GEOMETRY_TYPES, geometryTypesOf } from './geometry'

/** Ids of feature kinds and layers: letters, digits, `.`, `_` and `-`, starting with a letter or digit. */
export const MAPS_ID_PATTERN = /^[a-z0-9][\w.-]{0,79}$/i

/** The smallest refresh interval of a live layer, in seconds. */
export const MIN_REFRESH_INTERVAL = 5

/** The registry the runtime holds: definitions by id plus the module files to import. */
export type BuiltMapsRegistry = {
  kinds: Record<string, MapFeatureKindInfo>
  layers: Record<string, MapLayerInfo>
  /** Feature kind id -> absolute path of its properties schema file. */
  propertyFiles: Record<string, string>
  /** Feature kind id -> absolute path of its details component. */
  kindComponents: Record<string, string>
}

const isTranslated = (value: unknown) => (typeof value === 'string' && value.trim() !== '')
  || (!!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).length > 0 && Object.values(value).every(text => typeof text === 'string'))

/** Keeps the last definition of each id, in the order they were first registered. */
export function lastById<T>(items: readonly T[], idOf: (item: T) => string): T[] {
  const byId = new Map<string, T>()
  for (const item of items) byId.set(idOf(item), item)
  return [...byId.values()]
}

/** The issues of one feature kind. */
export function featureKindIssues(kind: MapFeatureKindDefinition): string[] {
  const where = `feature kind "${kind?.id}"`
  const issues: string[] = []
  if (typeof kind?.id !== 'string' || !MAPS_ID_PATTERN.test(kind.id)) issues.push(`${where}: the id is invalid.`)
  if (!isTranslated(kind?.label)) issues.push(`${where}: a label is required.`)
  const types = kind?.geometry ? geometryTypesOf(kind.geometry) : []
  if (!types.length || types.some(type => !(MAP_GEOMETRY_TYPES as readonly string[]).includes(type))) {
    issues.push(`${where}: the geometry must be ${MAP_GEOMETRY_TYPES.join(', ')} or a list of them.`)
  }
  if (kind?.properties !== undefined && (typeof kind.properties !== 'string' || !kind.properties)) issues.push(`${where}: properties must be a file path.`)
  if (kind?.component !== undefined && (typeof kind.component !== 'string' || !kind.component)) issues.push(`${where}: component must be a file path.`)
  return issues
}

/** The issues of one live layer. */
export function layerDefinitionIssues(layer: MapLayerDefinition): string[] {
  const where = `layer "${layer?.id}"`
  const issues: string[] = []
  if (typeof layer?.id !== 'string' || !MAPS_ID_PATTERN.test(layer.id)) issues.push(`${where}: the id is invalid.`)
  if (!isTranslated(layer?.label)) issues.push(`${where}: a label is required.`)
  const surfaces = layer?.appliesTo === undefined ? [] : [layer.appliesTo].flat()
  if (!surfaces.length || surfaces.some(surface => typeof surface !== 'string' || !MAPS_ID_PATTERN.test(surface))) {
    issues.push(`${where}: appliesTo needs one or more surface names.`)
  }
  if (typeof layer?.endpoint !== 'string' || !layer.endpoint.startsWith('/') || layer.endpoint.startsWith('//')) {
    issues.push(`${where}: endpoint must be a path on this app (\`/api/...\`).`)
  }
  if (layer?.permission !== undefined && (typeof layer.permission !== 'string' || !layer.permission.includes(':'))) {
    issues.push(`${where}: permission must be a permission name (resource:action).`)
  }
  if (layer?.refreshInterval !== undefined && (typeof layer.refreshInterval !== 'number' || !Number.isFinite(layer.refreshInterval) || layer.refreshInterval < MIN_REFRESH_INTERVAL)) {
    issues.push(`${where}: refreshInterval is in seconds and at least ${MIN_REFRESH_INTERVAL}.`)
  }
  return issues
}

/**
 * Merges every registration (a later definition with the same id replaces an earlier one) and validates the result.
 * Returns the runtime registry and the issues; any issue should fail the build.
 */
export function buildMapsRegistry(extensions: readonly MapsExtension[]): { registry: BuiltMapsRegistry, issues: string[] } {
  const issues: string[] = []
  const kindDefs = lastById(extensions.flatMap(extension => extension.kinds ?? []), kind => kind?.id)
  const layerDefs = lastById(extensions.flatMap(extension => extension.layers ?? []), layer => layer?.id)
  const registry: BuiltMapsRegistry = { kinds: {}, layers: {}, propertyFiles: {}, kindComponents: {} }

  for (const kind of kindDefs) {
    const kindIssues = featureKindIssues(kind)
    issues.push(...kindIssues)
    if (kindIssues.length) continue
    registry.kinds[kind.id] = {
      id: kind.id,
      label: kind.label,
      icon: kind.icon ?? null,
      geometry: [...new Set(geometryTypesOf(kind.geometry))],
      color: kind.color ?? null,
      hasProperties: !!kind.properties,
      hasComponent: !!kind.component,
    }
    if (kind.properties) registry.propertyFiles[kind.id] = kind.properties
    if (kind.component) registry.kindComponents[kind.id] = kind.component
  }

  for (const layer of layerDefs) {
    const layerIssues = layerDefinitionIssues(layer)
    issues.push(...layerIssues)
    if (layerIssues.length) continue
    registry.layers[layer.id] = {
      id: layer.id,
      label: layer.label,
      appliesTo: [...new Set([layer.appliesTo].flat())],
      endpoint: layer.endpoint,
      refreshInterval: layer.refreshInterval ?? null,
      permission: layer.permission ?? null,
      visible: layer.visible ?? true,
      color: layer.color ?? null,
    }
  }

  return { registry, issues }
}

/** The live layers drawn on a surface, in registration order, narrowed to `only` when given. */
export function layersForSurface(layers: Record<string, MapLayerInfo>, surface: string | null | undefined, only?: readonly string[]): MapLayerInfo[] {
  if (!surface) return []
  return Object.values(layers).filter(layer => layer.appliesTo.includes(surface) && (!only || only.includes(layer.id)))
}

/**
 * A layer's endpoint with its `:params` filled from `params` (URL-encoded), or `null` when one is missing. Extra params
 * are ignored.
 */
export function layerUrl(endpoint: string, params: Record<string, string | number | null | undefined> = {}): string | null {
  let missing = false
  const url = endpoint.replace(/:(\w+)/g, (_match, name: string) => {
    const value = params[name]
    if (value === undefined || value === null || value === '') {
      missing = true
      return ''
    }
    return encodeURIComponent(String(value))
  })
  return missing ? null : url
}
