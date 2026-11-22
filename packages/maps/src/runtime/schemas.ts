// zod schemas of the values modules store: a geographic location and a plane layout. Imports only zod and pure helpers,
// so a module's server routes, its forms and its tests can all use them (`@frigear-nu/maps/schemas`).
import { z } from 'zod'
import type { GeoPoint, MapLocation, PlaneFeature, PlaneFeatureCollection, PlaneGeometry } from '../types'
import { MAX_PLANE_COORDINATE, validateGeometry } from './utils/geometry'
import { MAX_UNDERLAY_DIMENSION, isSameAppPath } from './utils/image'

/** The most corners an area may have. */
export const MAX_AREA_CORNERS = 500

/** The largest radius a location may have: 50 km. */
export const MAX_RADIUS_METERS = 50_000

/** The most features a plane layout may hold by default. */
export const MAX_PLANE_FEATURES = 2000

/** Feature ids: letters, digits, `_` and `-`, at most 64 characters. Stable: records refer to them. */
export const PLANE_FEATURE_ID = /^[\w-]{1,64}$/

export const geoPointSchema: z.ZodType<GeoPoint> = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

/** A location: a point, with a radius or an area (never both). Extra keys are dropped. */
export const mapLocationSchema: z.ZodType<MapLocation> = z.object({
  point: geoPointSchema,
  radiusMeters: z.number().positive().max(MAX_RADIUS_METERS).optional(),
  area: z.array(geoPointSchema).min(3).max(MAX_AREA_CORNERS).optional(),
}).refine(location => !(location.radiusMeters !== undefined && location.area !== undefined), {
  message: 'A location has a radius or an area, not both.',
  path: ['area'],
})

const translatedSchema = z.union([z.string().max(200), z.record(z.string().min(2).max(16), z.string().max(200))])

/** A plane geometry (`Point`, `LineString`, `Polygon`) in plane units; an open polygon ring is closed. */
export const planeGeometrySchema: z.ZodType<PlaneGeometry> = z.unknown().transform((value, ctx) => {
  const check = validateGeometry(value)
  if (!check.ok) {
    ctx.addIssue({ code: 'custom', message: check.message })
    return z.NEVER
  }
  return check.geometry
}) as unknown as z.ZodType<PlaneGeometry>

export const planeFeatureSchema: z.ZodType<PlaneFeature> = z.object({
  type: z.literal('Feature').default('Feature'),
  id: z.string().regex(PLANE_FEATURE_ID, 'A feature id is letters, digits, _ and -.'),
  kind: z.string().min(1).max(80),
  geometry: planeGeometrySchema,
  properties: z.record(z.string(), z.unknown()).default({}),
  label: translatedSchema.nullish(),
}) as unknown as z.ZodType<PlaneFeature>

const extentSchema = z.object({
  width: z.number().positive().max(MAX_PLANE_COORDINATE),
  height: z.number().positive().max(MAX_PLANE_COORDINATE),
})

const underlaySchema = z.object({
  // A path on this app (the owning module's underlay route), never an external URL: see `isSameAppPath`.
  url: z.string().min(1).max(2000).refine(isSameAppPath, 'The underlay must be an image uploaded to this app (a path starting with /).'),
  width: z.number().int().positive().max(MAX_UNDERLAY_DIMENSION),
  height: z.number().int().positive().max(MAX_UNDERLAY_DIMENSION),
})

export type PlaneLayoutSchemaOptions = {
  /** The feature kinds this layout may hold. Default: any kind (check them with `validatePlaneLayout` on the server). */
  kinds?: readonly string[]
  /** The most features. Default: 2000. */
  maxFeatures?: number
}

/**
 * A plane layout (`PlaneFeatureCollection`): feature ids unique, kinds among `kinds` when given. The feature kinds'
 * own properties schemas are checked on the server by `validatePlaneLayout`, which needs the registry.
 */
export function planeFeatureCollectionSchema(options: PlaneLayoutSchemaOptions = {}): z.ZodType<PlaneFeatureCollection> {
  const kinds = options.kinds ? new Set(options.kinds) : undefined
  return z.object({
    type: z.literal('FeatureCollection').default('FeatureCollection'),
    features: z.array(planeFeatureSchema).max(options.maxFeatures ?? MAX_PLANE_FEATURES),
    extent: extentSchema.nullish(),
    underlay: underlaySchema.nullish(),
  }).superRefine((layout, ctx) => {
    const seen = new Set<string>()
    layout.features.forEach((feature, index) => {
      if (seen.has(feature.id)) ctx.addIssue({ code: 'custom', message: `The feature id "${feature.id}" is used twice.`, path: ['features', index, 'id'] })
      seen.add(feature.id)
      if (kinds && !kinds.has(feature.kind)) ctx.addIssue({ code: 'custom', message: `The kind "${feature.kind}" is not allowed here.`, path: ['features', index, 'kind'] })
    })
  }) as unknown as z.ZodType<PlaneFeatureCollection>
}

/** A plane layout of any kinds (see `planeFeatureCollectionSchema` to narrow them). */
export const planeLayoutSchema = planeFeatureCollectionSchema()

/** An empty plane layout. */
export const emptyPlaneLayout = (): PlaneFeatureCollection => ({ type: 'FeatureCollection', features: [] })
