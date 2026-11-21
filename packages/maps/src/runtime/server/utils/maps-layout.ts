import { kinds as registeredKinds, propertySchemas } from '#maps/server-registry'
import { planeFeatureCollectionSchema } from '../../schemas'
import type { PlaneLayoutSchemaOptions } from '../../schemas'
import { validateGeometry } from '../../utils/geometry'
import type { PlaneFeatureCollection } from '../../../types'

/** A problem with a value, in the shape `validationError` of `@frigear-nu/module-kit/server` takes. */
export type MapsIssue = { path: PropertyKey[], message: string }

export type PlaneLayoutCheck = { success: true, data: PlaneFeatureCollection } | { success: false, issues: MapsIssue[] }

/**
 * Validates a plane layout a client sent: its shape (`planeFeatureCollectionSchema`), every feature's kind against the
 * registry (registered, allowed by `kinds`, a geometry the kind may have) and its `properties` against the kind's zod
 * schema. Returns the cleaned layout (geometries normalised, properties as the schemas parsed them) or the issues, with
 * paths such as `features.3.properties.capacity`.
 *
 * ```ts
 * const body = await readValidatedBody(event, z.object({ layout: z.unknown() }).parse)
 * const check = validatePlaneLayout(body.layout, { kinds: ['operations.station', 'maps.area'] })
 * if (!check.success) throw validationError(check.issues)
 * ```
 */
export function validatePlaneLayout(value: unknown, options: PlaneLayoutSchemaOptions = {}): PlaneLayoutCheck {
  const parsed = planeFeatureCollectionSchema(options).safeParse(value)
  if (!parsed.success) return { success: false, issues: parsed.error.issues.map(issue => ({ path: issue.path, message: issue.message })) }
  const issues: MapsIssue[] = []
  const features = parsed.data.features.map((feature, index) => {
    const kind = registeredKinds[feature.kind]
    if (!kind) {
      issues.push({ path: ['features', index, 'kind'], message: `The feature kind "${feature.kind}" is not registered.` })
      return feature
    }
    const geometry = validateGeometry(feature.geometry, kind.geometry)
    if (!geometry.ok) issues.push({ path: ['features', index, 'geometry'], message: geometry.message })
    const schema = propertySchemas[feature.kind]
    if (!schema) return feature
    const properties = schema.safeParse(feature.properties)
    if (!properties.success) {
      for (const issue of properties.error.issues) issues.push({ path: ['features', index, 'properties', ...issue.path], message: issue.message })
      return feature
    }
    return { ...feature, properties: properties.data as Record<string, unknown> }
  })
  if (issues.length) return { success: false, issues }
  return { success: true, data: { ...parsed.data, features } }
}
