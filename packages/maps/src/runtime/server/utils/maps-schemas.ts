import { z } from 'zod'
import { visibilitySchema } from '@frigear-nu/audience'
import { pageQuery } from '@frigear-nu/module-kit/server'

// Request schemas of the maps routes. Shapes that depend on the registry (the view of a base, a feature's geometry and
// properties) are checked in the handlers after parsing.

/** A map key or a layer key: letters, digits, `.`, `_` and `-`, starting with a letter or digit. */
export const mapsKeySchema = z.string().trim().regex(/^[a-z0-9][\w.-]{0,127}$/i, 'Use letters, digits, ".", "_" and "-".')

/** A text in one language, or a locale -> text map with at least one text. */
export const mapsTranslatedInput = (max = 200) => z.union([
  z.string().trim().min(1).max(max),
  z.record(z.string().min(2).max(16), z.string().trim().max(max))
    .refine(value => Object.values(value).some(Boolean), 'Write the text in at least one language.'),
])

/** `visibility` as stored: audience's strict shape (unknown keys fail), or `null` for signed-in viewers. */
export const mapsVisibilityInput = visibilitySchema.nullable()

/** `:map` (an id or a key) of the read and edit routes. */
export const mapsMapParams = z.object({ map: z.string().trim().min(1).max(160) })
export const mapsLayerKeyParams = mapsMapParams.extend({ layerKey: z.string().trim().min(1).max(160) })
export const mapsFeatureParams = mapsMapParams.extend({ featureId: z.string().trim().min(1).max(64) })
export const mapsAdminLayerParams = z.object({ id: z.string().trim().min(1), layerId: z.string().trim().min(1) })

/** `GET /api/maps`: one owner's maps (`ownerType` alone lists every map of that type the caller may see). */
export const mapsListQuery = z.object({
  ownerType: z.string().trim().min(1).max(64).optional(),
  ownerId: z.string().trim().min(1).max(128).optional(),
})

/** `GET /api/admin/maps`. */
export const mapsAdminListQuery = pageQuery({
  sort: ['updatedAt', 'createdAt', 'kind'],
  defaultSort: 'updatedAt',
  filters: {
    ownerType: z.string().trim().min(1).max(64).optional(),
    ownerId: z.string().trim().min(1).max(128).optional(),
    kind: z.string().trim().min(1).max(80).optional(),
  },
})

/** `POST /api/admin/maps`. The base comes from the kind; `view` defaults to the kind's. */
export const mapsCreateInput = z.object({
  kind: z.string().trim().min(1).max(80),
  ownerType: z.string().trim().min(1).max(64),
  ownerId: z.string().trim().min(1).max(128).nullish(),
  name: mapsTranslatedInput(),
  key: mapsKeySchema.nullish(),
  view: z.unknown().optional(),
  visibility: mapsVisibilityInput.optional(),
})

/** `PATCH /api/admin/maps/:id`. The kind (and so the base) cannot change. */
export const mapsPatchInput = z.object({
  name: mapsTranslatedInput().optional(),
  key: mapsKeySchema.nullable().optional(),
  view: z.unknown().optional(),
  visibility: mapsVisibilityInput.optional(),
  ownerType: z.string().trim().min(1).max(64).optional(),
  ownerId: z.string().trim().min(1).max(128).nullable().optional(),
})

/** `POST /api/admin/maps/:id/layers`. */
export const mapsLayerInput = z.object({
  key: mapsKeySchema,
  name: mapsTranslatedInput(),
  sort: z.number().int().min(-10000).max(10000).optional(),
  visible: z.boolean().optional(),
  editable: z.boolean().optional(),
  visibility: mapsVisibilityInput.optional(),
})

/** `PATCH /api/admin/maps/:id/layers/:layerId`. */
export const mapsLayerPatchInput = mapsLayerInput.partial()

/** `POST /api/maps/:map/features`. Geometry and properties are checked against the feature kind afterwards. */
export const mapsFeatureInput = z.object({
  /** Defaults to the map's first editable layer. */
  layerId: z.string().trim().min(1).max(64).optional(),
  featureKind: z.string().trim().min(1).max(80),
  geometry: z.unknown(),
  properties: z.record(z.string(), z.unknown()).optional(),
  label: mapsTranslatedInput(500).nullable().optional(),
  linkMapId: z.string().trim().min(1).max(64).nullable().optional(),
  sort: z.number().int().min(-100000).max(100000).optional(),
})

/** `PATCH /api/maps/:map/features/:featureId`. */
export const mapsFeaturePatchInput = mapsFeatureInput.partial()

/** The text fields of `POST /api/admin/maps/:id/underlay` (the multipart form also has a `file`). */
export const mapsUnderlayFields = z.object({
  width: z.coerce.number().int().min(1).max(20000),
  height: z.coerce.number().int().min(1).max(20000),
})
