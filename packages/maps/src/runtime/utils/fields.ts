// Turns a feature kind's zod properties schema into the fields of the editor's generated form. Pure: used by the
// editor and covered by unit tests.
import type { Translated } from '@frigear-nu/ui/translated'
import { MAPS_TRANSLATED, propertyMeta } from './properties'

/** The field types the generated form can render. Anything else is listed as `unsupported` and left untouched. */
export type MapPropertyFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'translated' | 'unsupported'

export type MapPropertyField = {
  key: string
  type: MapPropertyFieldType
  /** The value must be given (not `.optional()`, `.nullable()` or with a default). */
  required: boolean
  label: Translated | null
  help: Translated | null
  /** The choices of an `enum`. */
  options?: string[]
  /** `z.number().int()`. */
  integer?: boolean
  min?: number
  max?: number
  /** The schema's default value, when it has one. */
  defaultValue?: unknown
}

type ZodLike = {
  _zod?: { def?: Record<string, unknown> & { type?: string } }
  shape?: Record<string, unknown>
}

const defOf = (schema: unknown) => (schema as ZodLike | undefined)?._zod?.def

/** Unwraps `.optional()`, `.nullable()`, `.default()` and friends, noting whether the value may be left out. */
function unwrap(schema: unknown): { inner: unknown, required: boolean, defaultValue?: unknown } {
  let current = schema
  let required = true
  let defaultValue: unknown
  for (let depth = 0; depth < 8; depth++) {
    const def = defOf(current)
    if (!def) break
    if (def.type === 'optional' || def.type === 'nullable' || def.type === 'nonoptional' || def.type === 'readonly' || def.type === 'catch' || def.type === 'prefault') {
      if (def.type !== 'nonoptional' && def.type !== 'readonly') required = false
      current = def.innerType
      continue
    }
    if (def.type === 'default') {
      required = false
      const value = def.defaultValue
      defaultValue = typeof value === 'function' ? (value as () => unknown)() : value
      current = def.innerType
      continue
    }
    break
  }
  return { inner: current, required, defaultValue }
}

/** One property schema to a form field. */
export function propertyField(key: string, schema: unknown): MapPropertyField {
  const meta = propertyMeta(schema)
  const { inner, required, defaultValue } = unwrap(schema)
  const field: MapPropertyField = { key, type: 'unsupported', required, label: meta.label ?? null, help: meta.help ?? null }
  if (defaultValue !== undefined) field.defaultValue = defaultValue
  if (meta.mapsType === MAPS_TRANSLATED) return { ...field, type: 'translated' }

  const def = defOf(inner)
  switch (def?.type) {
    case 'string':
      field.type = 'string'
      // The length limits: zod fills a string's bag lazily, its getters always answer.
      if (typeof (inner as { minLength?: unknown }).minLength === 'number') field.min = (inner as { minLength: number }).minLength
      if (typeof (inner as { maxLength?: unknown }).maxLength === 'number') field.max = (inner as { maxLength: number }).maxLength
      break
    case 'number':
      field.type = 'number'
      {
        // zod fills the bag lazily; the number's getters always answer.
        const number = inner as { minValue?: unknown, maxValue?: unknown, isInt?: unknown }
        if (typeof number.minValue === 'number' && Number.isFinite(number.minValue)) field.min = number.minValue
        if (typeof number.maxValue === 'number' && Number.isFinite(number.maxValue)) field.max = number.maxValue
        if (number.isInt === true) field.integer = true
      }
      break
    case 'boolean':
      field.type = 'boolean'
      break
    case 'enum': {
      const entries = def.entries as Record<string, string | number> | undefined
      field.type = 'enum'
      field.options = Object.values(entries ?? {}).map(String)
      break
    }
    case 'literal': {
      const values = def.values as unknown[] | undefined
      if (values?.every(value => typeof value === 'string')) {
        field.type = 'enum'
        field.options = values as string[]
      }
      break
    }
  }
  return field
}

/**
 * The form fields of a properties schema (a `z.object`), in declaration order. A schema that is not an object gives
 * no fields.
 */
export function propertyFields(schema: unknown): MapPropertyField[] {
  if (!schema) return []
  const { inner } = unwrap(schema)
  const def = defOf(inner)
  if (def?.type !== 'object') return []
  const shape = (inner as ZodLike).shape ?? (def.shape as Record<string, unknown> | undefined) ?? {}
  return Object.entries(shape).map(([key, value]) => propertyField(key, value))
}

/**
 * The starting values of a new feature's properties: each field's default, `false` for a required boolean. Fields
 * without a default stay unset.
 */
export function initialPropertyValues(fields: MapPropertyField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.defaultValue !== undefined) values[field.key] = field.defaultValue
    else if (field.type === 'boolean' && field.required) values[field.key] = false
  }
  return values
}

/**
 * Cleans form values before they are sent: empty strings and empty translated texts of optional fields are left out,
 * and number inputs that hold text become numbers.
 */
export function cleanPropertyValues(fields: MapPropertyField[], values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const known = new Set(fields.map(field => field.key))
  for (const field of fields) {
    let value = values[field.key]
    if (field.type === 'number' && typeof value === 'string') value = value.trim() === '' ? undefined : Number(value)
    if (field.type === 'string' && typeof value === 'string' && !value.trim() && !field.required) value = undefined
    if (field.type === 'translated' && !field.required) {
      const empty = !value || (typeof value === 'string' ? !value.trim() : typeof value === 'object' && !Object.values(value as Record<string, string>).some(text => text?.trim()))
      if (empty) value = undefined
    }
    if (value !== undefined && value !== null) result[field.key] = value
  }
  // Unsupported fields and keys the form does not know keep their stored values.
  for (const [key, value] of Object.entries(values)) {
    if (!known.has(key) && value !== undefined) result[key] = value
  }
  for (const field of fields) {
    if (field.type === 'unsupported' && values[field.key] !== undefined) result[field.key] = values[field.key]
  }
  return result
}
