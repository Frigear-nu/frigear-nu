import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, inArray, or } from 'drizzle-orm'
import { isVisible, parseVisibility } from '@frigear-nu/audience'
import type { Viewer, Visibility } from '@frigear-nu/audience'
import { resolveOwner, resolveViewer } from '@frigear-nu/audience/server'
import { apiError, conflict, notFound, validationError } from '@frigear-nu/module-kit/server'
import { mapsAccess } from '../../access'
import { newId } from '../../utils'
import { validateGeometry } from '../../utils/geometry'
import { viewIssue } from '../../utils/view'
import type {
  AdminMapDto,
  EnsureMapDefinition,
  MapBase,
  MapFeatureCollection,
  MapFeatureDto,
  MapGeometry,
  MapKindInfo,
  MapKindLayer,
  MapLayerInfo,
  MapsEditResolveContext,
  MapSource,
  MapsSeedResolveContext,
  MapViewport,
  OwnerRef,
  Translated,
} from '../../../types'
import { toAdminMapDto, toMapDto, toMapFeatureDto } from './maps-dto'
import { mapsFeatureKind, mapsKind, mapsPropertySchema, mapsProvider, mapsProviderLayersFor } from './maps-registry'

export type MapRow = typeof schema.maps.$inferSelect
export type MapLayerRow = typeof schema.mapLayers.$inferSelect
export type MapFeatureRow = typeof schema.mapFeatures.$inferSelect

// --- Lookups ---------------------------------------------------------------------------------------------------------

export async function findMapById(id: string): Promise<MapRow | undefined> {
  const [row] = await db.select().from(schema.maps).where(eq(schema.maps.id, id)).limit(1)
  return row
}

export async function findMapByKey(key: string): Promise<MapRow | undefined> {
  const [row] = await db.select().from(schema.maps).where(eq(schema.maps.key, key)).limit(1)
  return row
}

/** The map with this id, else the one with this key. Ids (`map_...`) and keys never collide in practice. */
export async function findMapByIdOrKey(value: string): Promise<MapRow | undefined> {
  const rows = await db.select().from(schema.maps).where(or(eq(schema.maps.id, value), eq(schema.maps.key, value))).limit(2)
  return rows.find(row => row.id === value) ?? rows[0]
}

/** The row with this id, or a 404. */
export async function getMapOr404(id: string): Promise<MapRow> {
  const row = await findMapById(id)
  if (!row) throw notFound('Map not found.')
  return row
}

/** The layer with this id on this map, or a 404. */
export async function getMapLayerOr404(mapId: string, layerId: string): Promise<MapLayerRow> {
  const [row] = await db.select().from(schema.mapLayers)
    .where(and(eq(schema.mapLayers.mapId, mapId), eq(schema.mapLayers.id, layerId))).limit(1)
  if (!row) throw notFound('Layer not found.')
  return row
}

/** The feature with this id on this map, or a 404. */
export async function getMapFeatureOr404(mapId: string, featureId: string): Promise<MapFeatureRow> {
  const [row] = await db.select().from(schema.mapFeatures)
    .where(and(eq(schema.mapFeatures.mapId, mapId), eq(schema.mapFeatures.id, featureId))).limit(1)
  if (!row) throw notFound('Feature not found.')
  return row
}

/** A map's layers, in their order. */
export function listMapLayers(mapId: string): Promise<MapLayerRow[]> {
  return db.select().from(schema.mapLayers).where(eq(schema.mapLayers.mapId, mapId))
    .orderBy(asc(schema.mapLayers.sort), asc(schema.mapLayers.key))
}

/** The features of some layers of a map, in their order. */
export async function listMapFeatures(mapId: string, layerIds: string[]): Promise<MapFeatureRow[]> {
  if (!layerIds.length) return []
  return db.select().from(schema.mapFeatures)
    .where(and(eq(schema.mapFeatures.mapId, mapId), inArray(schema.mapFeatures.layerId, layerIds)))
    .orderBy(asc(schema.mapFeatures.sort), asc(schema.mapFeatures.createdAt))
}

// --- Who is looking, and what they may do ------------------------------------------------------------------------------

/** A map is public when its visibility says `public: true`: everyone reads it, anonymous visitors included. */
export const isMapPublic = (row: Pick<MapRow, 'visibility'>) => parseVisibility(row.visibility)?.public === true

type MapsEventContext = { mapsViewer?: Promise<Viewer> }

/**
 * Who is looking, resolved once per request (`audience:viewer:resolve` fills in team roles and operations). Anonymous
 * visitors get an empty viewer.
 */
export function resolveMapsViewer(event: H3Event): Promise<Viewer> {
  const context = event.context as MapsEventContext
  context.mapsViewer ??= (async () => {
    const principal = await getAuth(event)
    const user = principal?.user ?? null
    return resolveViewer(event, {
      hooks: useNitroApp().hooks,
      user: user as { id: string | number } | null,
      globalRoles: user ? await getEffectiveRoles(event, user) : [],
    })
  })()
  return context.mapsViewer
}

/** Whether a stored visibility lets the viewer see a record (the policy of `maps:read`, without the staff bypass). */
export function mapsVisibleTo(visibility: unknown, viewer: Viewer): boolean {
  return isVisible(parseVisibility(visibility), viewer)
}

/** A layer narrows its map: `null` inherits the map's visibility, anything else must let the viewer in too. */
export function mapsLayerVisibleTo(layer: Pick<MapLayerRow, 'visibility'>, viewer: Viewer): boolean {
  if (layer.visibility === null || layer.visibility === undefined) return true
  return mapsVisibleTo(layer.visibility, viewer)
}

/**
 * The map behind `:map` (id or key) for a reader: a public map for everyone; any other only through `maps:read` and
 * its policy. Anonymous callers and tokens without `maps:read` get a 401/403 before anything is looked up for them; a
 * map the caller may not see is the same 404 as an unknown one.
 */
export async function getReadableMapOr404(event: H3Event, value: string): Promise<MapRow> {
  const row = await findMapByIdOrKey(value)
  if (row && isMapPublic(row)) return row
  await authorize(event, mapsAccess.permissions.read)
  if (!row || !(await allows(event, mapsAccess.permissions.read, row))) throw notFound('Map not found.')
  return row
}

/**
 * The record rule of `maps:edit`: staff with `maps:manage`, holders of the kind's `editPermission`, or anyone an owner
 * module allows through `maps:edit:resolve` (a team's leads, an operation's coordinators).
 */
export async function mapsCanEdit(event: H3Event, user: { id: string | number }, row: MapRow): Promise<boolean> {
  if (await allows(event, mapsAccess.permissions.manage)) return true
  const kind = mapsKind(row.kind)
  if (kind?.editPermission && await allows(event, kind.editPermission as Parameters<typeof allows>[1])) return true
  const ctx: MapsEditResolveContext = { event, user, map: toAdminMapDto(row), allowed: false }
  await useNitroApp().hooks.callHook('maps:edit:resolve', ctx)
  return ctx.allowed === true
}

// --- Validation ------------------------------------------------------------------------------------------------------

/** The registered kind, or a 400. */
export function mapsKindOr400(id: string, field = 'kind'): MapKindInfo {
  const kind = mapsKind(id)
  if (!kind) throw validationError([{ path: [field], message: `The map kind "${id}" is not registered.` }], 'Unknown map kind')
  return kind
}

/** The kind of an existing map, or a 409 when the module that registered it is gone. */
export function mapsKindOfMap(row: Pick<MapRow, 'kind'>): MapKindInfo {
  const kind = mapsKind(row.kind)
  if (!kind) throw apiError(409, 'unknown_kind', `The map kind "${row.kind}" is no longer registered.`)
  return kind
}

/** A view for a base: the given one when valid (400 otherwise), else `fallback`. */
export function mapsViewOr400(base: MapBase, view: unknown, fallback: MapViewport): MapViewport {
  if (view === undefined || view === null) return fallback
  const issue = viewIssue(base, view)
  if (issue) throw validationError([{ path: ['view'], message: issue }], 'Invalid view')
  return view as MapViewport
}

/**
 * Checks an owner: the platform has no id; any other must exist according to `audience:owner:resolve` (operations
 * answers `operation`, teams answers `team`), else 400. When the kind sets an owner type, the owner must have it.
 */
export async function mapsAssertOwner(event: H3Event, owner: OwnerRef, kind?: MapKindInfo): Promise<Translated | null> {
  if (kind?.ownerType && kind.ownerType !== owner.type) {
    throw validationError([{ path: ['ownerType'], message: `Maps of this kind belong to a "${kind.ownerType}".` }], 'Unknown owner')
  }
  if (owner.type === 'platform') {
    if (owner.id) throw validationError([{ path: ['ownerId'], message: 'A platform-owned map has no owner id.' }], 'Unknown owner')
    return null
  }
  if (!owner.id) throw validationError([{ path: ['ownerId'], message: 'Choose the owner.' }], 'Unknown owner')
  const resolved = await resolveOwner(event, owner, { hooks: useNitroApp().hooks })
  if (resolved.exists !== true) {
    throw validationError([{ path: ['ownerId'], message: resolved.exists === false ? 'This owner does not exist.' : `No installed module knows the owner type "${owner.type}".` }], 'Unknown owner')
  }
  return resolved.label
}

/** The owner's label for the staff DTO: `null` for the platform and for owners nobody answers for. */
export async function mapsOwnerLabel(event: H3Event, row: Pick<MapRow, 'ownerType' | 'ownerId'>): Promise<Translated | null> {
  if (row.ownerType === 'platform' || !row.ownerId) return null
  return (await resolveOwner(event, { type: row.ownerType, id: row.ownerId }, { hooks: useNitroApp().hooks })).label
}

/** Staff DTOs with their owners' labels, each owner resolved once. */
export async function toAdminMapDtos(event: H3Event, rows: MapRow[]): Promise<AdminMapDto[]> {
  const labels = new Map<string, Translated | null>()
  for (const row of rows) {
    const key = `${row.ownerType}\u0000${row.ownerId ?? ''}`
    if (!labels.has(key)) labels.set(key, await mapsOwnerLabel(event, row))
  }
  return rows.map(row => toAdminMapDto(row, labels.get(`${row.ownerType}\u0000${row.ownerId ?? ''}`) ?? null))
}

export type FeatureIssue = { path: (string | number)[], message: string }

/** A feature's kind, geometry and properties after the checks against the map's kind. */
export type ValidFeature = { featureKind: string, geometry: MapGeometry, properties: Record<string, unknown> }

/**
 * Checks a feature against the map: its kind must be one of the map kind's feature kinds, its geometry valid GeoJSON
 * of a type the feature kind allows, and its properties must pass the feature kind's zod schema (a kind without a
 * schema takes no properties). Throws a 400 with every issue.
 */
export async function mapsValidateFeature(map: Pick<MapRow, 'kind' | 'base'>, input: { featureKind: string, geometry: unknown, properties?: Record<string, unknown> }): Promise<ValidFeature> {
  const kind = mapsKindOfMap(map)
  if (!kind.featureKinds.includes(input.featureKind) || !mapsFeatureKind(input.featureKind)) {
    throw validationError([{ path: ['featureKind'], message: `Maps of this kind take ${kind.featureKinds.join(', ')}.` }], 'Unknown feature kind')
  }
  const featureKind = mapsFeatureKind(input.featureKind)!
  const issues: FeatureIssue[] = []
  const geometry = validateGeometry(input.geometry, map.base as MapBase, featureKind.geometry)
  if (!geometry.ok) issues.push({ path: ['geometry'], message: geometry.message })

  let properties: Record<string, unknown> = {}
  const schema = mapsPropertySchema(input.featureKind)
  if (schema) {
    const parsed = schema.safeParse(input.properties ?? {})
    if (parsed.success) properties = parsed.data as Record<string, unknown>
    else issues.push(...parsed.error.issues.map(issue => ({ path: ['properties', ...issue.path.map(part => typeof part === 'symbol' ? String(part) : part)], message: issue.message })))
  }
  else if (input.properties && Object.keys(input.properties).length) {
    issues.push({ path: ['properties'], message: 'This feature kind has no properties.' })
  }
  if (issues.length || !geometry.ok) throw validationError(issues, 'Invalid feature')
  return { featureKind: input.featureKind, geometry: geometry.geometry, properties }
}

/** 400 when `linkMapId` names no map. */
export async function mapsAssertLinkMap(linkMapId: string | null | undefined): Promise<void> {
  if (!linkMapId) return
  if (!(await findMapById(linkMapId))) throw validationError([{ path: ['linkMapId'], message: 'This map does not exist.' }], 'Unknown map')
}

/** The layer a feature goes on: the given one (on this map), else the first editable one. 409 when it is not editable. */
export async function mapsEditableLayerOr409(mapId: string, layerId?: string): Promise<MapLayerRow> {
  if (layerId) {
    const [row] = await db.select().from(schema.mapLayers)
      .where(and(eq(schema.mapLayers.mapId, mapId), eq(schema.mapLayers.id, layerId))).limit(1)
    if (!row) throw validationError([{ path: ['layerId'], message: 'This layer is not on the map.' }], 'Unknown layer')
    if (!row.editable) throw apiError(409, 'layer_not_editable', 'Features cannot be drawn on this layer.')
    return row
  }
  const row = (await listMapLayers(mapId)).find(layer => layer.editable)
  if (!row) throw apiError(409, 'layer_not_editable', 'This map has no layer features can be drawn on.')
  return row
}

/**
 * Whether a database error is a unique-constraint violation: sqlite (`SQLITE_CONSTRAINT_UNIQUE`, or the message of
 * libsql / D1 "UNIQUE constraint failed") and postgresql (`23505`). Drivers wrap the error, so `cause` is followed.
 */
export function isMapsUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const { code, message, cause } = current as { code?: unknown, message?: unknown, cause?: unknown }
    if (code === '23505') return true
    if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) return true
    if (typeof message === 'string' && /UNIQUE constraint failed/i.test(message)) return true
    current = cause
  }
  return false
}

/** 409 when another map uses `key`. */
export async function mapsAssertKeyFree(key: string | null | undefined, exceptId?: string): Promise<void> {
  if (!key) return
  const taken = await findMapByKey(key)
  if (taken && taken.id !== exceptId) throw conflict('A map with this key already exists.', { field: 'key' })
}

/** 409 when the map has a layer with `key`, or a provider layer with that key applies to it. */
export async function mapsAssertLayerKeyFree(row: Pick<MapRow, 'id' | 'kind' | 'key'>, key: string): Promise<void> {
  const taken = (await listMapLayers(row.id)).some(layer => layer.key === key)
    || mapsProviderLayersFor(row).some(layer => layer.key === key)
  if (taken) throw conflict('The map has a layer with this key already.', { field: 'key' })
}

// --- Creating maps -------------------------------------------------------------------------------------------------------

type CreateMapInput = {
  kind: MapKindInfo
  owner: OwnerRef
  name: Translated
  key?: string | null
  view: MapViewport
  visibility?: Visibility | null
  source: MapSource
}

/** Inserts a map and its kind's default layers (plus `extraLayers`, skipping keys that exist). */
export async function insertMapRow(input: CreateMapInput, extraLayers: MapKindLayer[] = []): Promise<MapRow> {
  const [row] = await db.insert(schema.maps).values({
    id: newId('map'),
    key: input.key ?? null,
    kind: input.kind.id,
    base: input.kind.base,
    ownerType: input.owner.type,
    ownerId: input.owner.type === 'platform' ? null : input.owner.id,
    name: input.name,
    view: input.view,
    underlay: null,
    visibility: input.visibility ?? null,
    source: input.source,
  }).returning()
  const keys = new Set<string>()
  const layers = [...input.kind.defaultLayers, ...extraLayers].filter((layer) => {
    if (keys.has(layer.key)) return false
    keys.add(layer.key)
    return true
  })
  if (layers.length) {
    await db.insert(schema.mapLayers).values(layers.map((layer, index) => ({
      id: newId('mpl'),
      mapId: row!.id,
      key: layer.key,
      name: layer.name,
      sort: layer.sort ?? index,
      visible: layer.visible ?? true,
      editable: layer.editable ?? true,
      visibility: layer.visibility ?? null,
    })))
  }
  return row!
}

/**
 * Creates a map from code, idempotent by `key`: when a map with the key exists it is returned as it is (its layers and
 * features are never touched again, so staff edits survive). Otherwise the map is created with the kind's default
 * layers, `layers` and `features`. Validates the kind, the owner (`audience:owner:resolve`), the view and every
 * feature, and throws a 400 when one is wrong.
 *
 * ```ts
 * await ensureMap(event, { key: `first-aid-${operation.id}`, kind: 'first-aid', owner: { type: 'operation', id: operation.id }, name: 'First aid' })
 * ```
 */
export async function ensureMap(event: H3Event, definition: EnsureMapDefinition): Promise<AdminMapDto> {
  const existing = await findMapByKey(definition.key)
  if (existing) return toAdminMapDto(existing)

  const kind = mapsKindOr400(definition.kind)
  const ownerLabel = await mapsAssertOwner(event, definition.owner, kind)
  const view = mapsViewOr400(kind.base, definition.view, kind.defaultView)
  const visibility = definition.visibility === undefined || definition.visibility === null ? null : parseVisibility(definition.visibility)
  const features = await Promise.all((definition.features ?? []).map(async feature => ({
    feature,
    valid: await mapsValidateFeature({ kind: kind.id, base: kind.base }, feature),
  })))

  let row: MapRow
  try {
    row = await insertMapRow({ kind, owner: definition.owner, name: definition.name, key: definition.key, view, visibility, source: 'code' }, definition.layers ?? [])
  }
  catch (error) {
    // Two requests can create the same map at once: the unique key decides, and the loser returns the winner's map.
    if (isMapsUniqueViolation(error)) {
      const winner = await findMapByKey(definition.key)
      if (winner) return toAdminMapDto(winner, ownerLabel)
    }
    throw error
  }

  if (features.length) {
    const layers = await listMapLayers(row.id)
    const fallback = layers.find(layer => layer.editable) ?? layers[0]
    const values = features.map(({ feature, valid }, index) => {
      const layer = feature.layer ? layers.find(candidate => candidate.key === feature.layer) : fallback
      if (!layer) throw validationError([{ path: ['features', index, 'layer'], message: `The map has no layer "${feature.layer}".` }], 'Unknown layer')
      return {
        id: newId('mpf'),
        mapId: row.id,
        layerId: layer.id,
        ...valid,
        label: feature.label ?? null,
        linkMapId: null,
        sort: feature.sort ?? index,
      }
    })
    await db.insert(schema.mapFeatures).values(values)
  }
  return toAdminMapDto(row, ownerLabel)
}

let seeding: Promise<void> | undefined

/**
 * Creates the maps `maps:seed:resolve` listeners ask for, once per server: on the first request, with that request's
 * event. A failure is logged and retried on the next request.
 */
export function ensureMapsSeeded(event: H3Event): Promise<void> {
  seeding ??= (async () => {
    const ctx: MapsSeedResolveContext = { event, maps: [] }
    await useNitroApp().hooks.callHook('maps:seed:resolve', ctx)
    for (const definition of ctx.maps) {
      try {
        await ensureMap(event, definition)
      }
      catch (error) {
        console.error(`[maps] the seeded map "${definition.key}" could not be created`, error)
      }
    }
  })().catch((error: unknown) => {
    seeding = undefined
    console.error('[maps] seeding failed; retried on the next request', error)
  })
  return seeding
}

// --- Provider layers -----------------------------------------------------------------------------------------------------

/**
 * Runs a provider layer for a map and keeps only valid features: a geometry of the types maps stores on the map's base.
 * A provider that throws or returns something else answers 502.
 */
export async function mapsRunProvider(event: H3Event, row: MapRow, layer: MapLayerInfo): Promise<MapFeatureCollection> {
  const provider = mapsProvider(layer.key)
  if (!provider) throw notFound('Layer not found.')
  let result: unknown
  try {
    result = await provider(event, toMapDto(row))
  }
  catch (error) {
    console.error(`[maps] the provider of the layer "${layer.key}" failed`, error)
    throw apiError(502, 'provider_failed', 'The layer could not be loaded.')
  }
  const features = (result as { features?: unknown } | null)?.features
  if (!result || (result as { type?: unknown }).type !== 'FeatureCollection' || !Array.isArray(features)) {
    console.error(`[maps] the provider of the layer "${layer.key}" did not return a FeatureCollection`)
    throw apiError(502, 'provider_failed', 'The layer could not be loaded.')
  }
  const valid: MapFeatureCollection['features'] = []
  for (const feature of features as Array<Record<string, unknown>>) {
    const geometry = validateGeometry(feature?.geometry, row.base as MapBase)
    if (!geometry.ok) continue
    const id = typeof feature.id === 'string' || typeof feature.id === 'number' ? feature.id : undefined
    const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties as Record<string, unknown> : null
    valid.push({ type: 'Feature', ...(id !== undefined ? { id } : {}), geometry: geometry.geometry, properties })
  }
  return { type: 'FeatureCollection', features: valid }
}

/** The feature DTO and its map's staff DTO for the `maps:feature:*` hooks. */
export function mapsFeatureHookContext(row: MapRow, feature: MapFeatureRow): { map: AdminMapDto, feature: MapFeatureDto } {
  return { map: toAdminMapDto(row), feature: toMapFeatureDto(feature) }
}
