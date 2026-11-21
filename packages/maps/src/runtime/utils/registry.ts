// Builds and validates the maps registry from what modules registered with `extendMaps`. Pure, so it is unit tested;
// `module.ts` calls it once every module is done and fails the build on an issue.
import type {
  MapEditorTool,
  MapFeatureKindDefinition,
  MapFeatureKindInfo,
  MapKindDefinition,
  MapKindInfo,
  MapKindLayer,
  MapLayerDefinition,
  MapLayerInfo,
  MapsExtension,
} from '../../types'
import { MAP_EDITOR_TOOLS, MAP_GEOMETRY_TYPES, geometryTypesOf, toolsForGeometries } from './geometry'
import { defaultViewFor, viewIssue } from './view'

/** Ids of kinds and feature kinds, and layer keys: letters, digits, `.`, `_` and `-`, starting with a letter or digit. */
export const MAPS_ID_PATTERN = /^[a-z0-9][\w.-]{0,79}$/i

/** The layer every map of a kind without `defaultLayers` starts with. */
export const DEFAULT_KIND_LAYERS: MapKindLayer[] = [
  { key: 'features', name: { da: 'Elementer', en: 'Features' }, sort: 0, visible: true, editable: true },
]

/** The registry the runtime holds: definitions by id (key for layers) plus the module files to import. */
export type BuiltMapsRegistry = {
  kinds: Record<string, MapKindInfo>
  featureKinds: Record<string, MapFeatureKindInfo>
  layers: Record<string, MapLayerInfo>
  /** Feature kind id -> absolute path of its properties schema file. */
  propertyFiles: Record<string, string>
  /** Feature kind id -> absolute path of its popup component. */
  featureComponents: Record<string, string>
  /** Layer key -> absolute path of its server provider. */
  providerFiles: Record<string, string>
  /** Layer key -> absolute path of its client renderer. */
  layerComponents: Record<string, string>
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

function layerIssues(where: string, layers: readonly MapKindLayer[]): string[] {
  const issues: string[] = []
  const keys = new Set<string>()
  for (const layer of layers) {
    if (typeof layer.key !== 'string' || !MAPS_ID_PATTERN.test(layer.key)) issues.push(`${where}: the layer key "${layer.key}" is invalid.`)
    else if (keys.has(layer.key)) issues.push(`${where}: the layer key "${layer.key}" is used twice.`)
    keys.add(layer.key)
    if (!isTranslated(layer.name)) issues.push(`${where}: the layer "${layer.key}" needs a name.`)
  }
  return issues
}

/** The issues of one feature kind on its own. */
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

/** The issues of one map kind, given the feature kinds that exist. */
export function kindIssues(kind: MapKindDefinition, featureKinds: Record<string, MapFeatureKindInfo>): string[] {
  const where = `map kind "${kind?.id}"`
  const issues: string[] = []
  if (typeof kind?.id !== 'string' || !MAPS_ID_PATTERN.test(kind.id)) issues.push(`${where}: the id is invalid.`)
  if (!isTranslated(kind?.label)) issues.push(`${where}: a label is required.`)
  if (kind?.base !== 'geo' && kind?.base !== 'plane') {
    issues.push(`${where}: the base must be "geo" or "plane".`)
    return issues
  }
  if (kind.ownerType !== undefined && (typeof kind.ownerType !== 'string' || !kind.ownerType)) issues.push(`${where}: the owner type must be a string.`)
  if (kind.defaultView !== undefined) {
    const issue = viewIssue(kind.base, kind.defaultView)
    if (issue) issues.push(`${where}: defaultView: ${issue}`)
  }
  if (!Array.isArray(kind.featureKinds) || !kind.featureKinds.length) issues.push(`${where}: at least one feature kind is required.`)
  for (const id of kind.featureKinds ?? []) {
    if (!featureKinds[id]) issues.push(`${where}: the feature kind "${id}" is not registered.`)
  }
  for (const tool of kind.editorTools ?? []) {
    if (!(MAP_EDITOR_TOOLS as readonly string[]).includes(tool)) issues.push(`${where}: unknown editor tool "${tool}".`)
  }
  if (kind.editorTools?.includes('snapGrid') && kind.base !== 'plane') issues.push(`${where}: snapGrid is for plane maps only.`)
  if (kind.defaultLayers !== undefined) {
    if (!Array.isArray(kind.defaultLayers)) issues.push(`${where}: defaultLayers must be a list.`)
    else issues.push(...layerIssues(where, kind.defaultLayers))
  }
  if (kind.editPermission !== undefined && (typeof kind.editPermission !== 'string' || !kind.editPermission.includes(':'))) {
    issues.push(`${where}: editPermission must be a permission name (resource:action).`)
  }
  if (kind.page !== undefined && (typeof kind.page !== 'string' || !kind.page.startsWith('/'))) issues.push(`${where}: page must be a path.`)
  return issues
}

/** The issues of one provider layer. */
export function layerDefinitionIssues(layer: MapLayerDefinition): string[] {
  const where = `layer "${layer?.key}"`
  const issues: string[] = []
  if (typeof layer?.key !== 'string' || !MAPS_ID_PATTERN.test(layer.key)) issues.push(`${where}: the key is invalid.`)
  if (!isTranslated(layer?.label)) issues.push(`${where}: a label is required.`)
  const targets = layer?.appliesTo ? [layer.appliesTo].flat() : []
  if (!targets.length) issues.push(`${where}: appliesTo needs a { kind } or { mapKey }.`)
  for (const target of targets) {
    const valid = target && typeof target === 'object'
      && (('kind' in target && typeof target.kind === 'string' && !!target.kind) || ('mapKey' in target && typeof target.mapKey === 'string' && !!target.mapKey))
    if (!valid) issues.push(`${where}: appliesTo needs a { kind } or { mapKey }.`)
  }
  if (typeof layer?.provider !== 'string' || !layer.provider) issues.push(`${where}: provider must be a server file path.`)
  if (layer?.component !== undefined && (typeof layer.component !== 'string' || !layer.component)) issues.push(`${where}: component must be a file path.`)
  if (layer?.permission !== undefined && (typeof layer.permission !== 'string' || !layer.permission.includes(':'))) {
    issues.push(`${where}: permission must be a permission name (resource:action).`)
  }
  if (layer?.refreshInterval !== undefined && (typeof layer.refreshInterval !== 'number' || !Number.isFinite(layer.refreshInterval) || layer.refreshInterval < 5)) {
    issues.push(`${where}: refreshInterval is in seconds and at least 5.`)
  }
  return issues
}

/** The default editor tools of a kind: the tools that draw its feature kinds' geometries, `text` with `maps.label`. */
export function defaultEditorTools(kind: Pick<MapKindDefinition, 'base' | 'featureKinds'>, featureKinds: Record<string, MapFeatureKindInfo>): MapEditorTool[] {
  const types = [...new Set(kind.featureKinds.flatMap(id => featureKinds[id]?.geometry ?? []))]
  const tools = toolsForGeometries(types).filter(tool => tool !== 'text' || kind.featureKinds.includes('maps.label'))
  if (kind.base === 'plane') tools.push('snapGrid')
  return tools
}

/**
 * Merges every registration (a later definition with the same id replaces an earlier one) and validates the result.
 * Returns the runtime registry and the issues; any issue should fail the build.
 */
export function buildMapsRegistry(extensions: readonly MapsExtension[]): { registry: BuiltMapsRegistry, issues: string[] } {
  const issues: string[] = []
  const featureKindDefs = lastById(extensions.flatMap(extension => extension.featureKinds ?? []), kind => kind?.id)
  const kindDefs = lastById(extensions.flatMap(extension => extension.kinds ?? []), kind => kind?.id)
  const layerDefs = lastById(extensions.flatMap(extension => extension.layers ?? []), layer => layer?.key)

  const registry: BuiltMapsRegistry = {
    kinds: {},
    featureKinds: {},
    layers: {},
    propertyFiles: {},
    featureComponents: {},
    providerFiles: {},
    layerComponents: {},
  }

  for (const kind of featureKindDefs) {
    const kindIssueList = featureKindIssues(kind)
    issues.push(...kindIssueList)
    if (kindIssueList.length) continue
    registry.featureKinds[kind.id] = {
      id: kind.id,
      label: kind.label,
      icon: kind.icon ?? null,
      geometry: [...new Set(geometryTypesOf(kind.geometry))],
      color: kind.color ?? null,
      hasProperties: !!kind.properties,
      hasComponent: !!kind.component,
    }
    if (kind.properties) registry.propertyFiles[kind.id] = kind.properties
    if (kind.component) registry.featureComponents[kind.id] = kind.component
  }

  for (const kind of kindDefs) {
    const kindIssueList = kindIssues(kind, registry.featureKinds)
    issues.push(...kindIssueList)
    if (kindIssueList.length) continue
    const featureKinds = [...new Set(kind.featureKinds)]
    registry.kinds[kind.id] = {
      id: kind.id,
      label: kind.label,
      base: kind.base,
      ownerType: kind.ownerType ?? null,
      defaultView: kind.defaultView ?? defaultViewFor(kind.base),
      featureKinds,
      editorTools: [...new Set(kind.editorTools ?? defaultEditorTools({ base: kind.base, featureKinds }, registry.featureKinds))],
      defaultLayers: (kind.defaultLayers ?? DEFAULT_KIND_LAYERS).map((layer, index) => ({
        key: layer.key,
        name: layer.name,
        sort: layer.sort ?? index,
        visible: layer.visible ?? true,
        editable: layer.editable ?? true,
        visibility: layer.visibility ?? null,
      })),
      editPermission: kind.editPermission ?? null,
      page: kind.page ?? null,
    }
  }

  for (const layer of layerDefs) {
    const layerIssueList = layerDefinitionIssues(layer)
    issues.push(...layerIssueList)
    if (layerIssueList.length) continue
    registry.layers[layer.key] = {
      key: layer.key,
      label: layer.label,
      appliesTo: [layer.appliesTo].flat(),
      permission: layer.permission ?? null,
      refreshInterval: layer.refreshInterval ?? null,
      visible: layer.visible ?? true,
      hasComponent: !!layer.component,
    }
    registry.providerFiles[layer.key] = layer.provider
    if (layer.component) registry.layerComponents[layer.key] = layer.component
  }

  return { registry, issues }
}

/** The provider layers that apply to a map (by its kind or its key), in registration order. */
export function providerLayersFor(layers: Record<string, MapLayerInfo>, map: { kind: string, key: string | null }): MapLayerInfo[] {
  return Object.values(layers).filter(layer => layer.appliesTo.some(target =>
    ('kind' in target && target.kind === map.kind) || ('mapKey' in target && !!map.key && target.mapKey === map.key)))
}
