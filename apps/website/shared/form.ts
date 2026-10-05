// shared/form.ts
import { z } from 'zod/v4'
import type { FormStep, SteppedForm, FormFieldDef } from './types/form'
import { defu } from 'defu'

type AnySchema = z.ZodType | z.core.$ZodType
type SchemaDefLike = {
  type?: string
  in?: AnySchema
  out?: AnySchema
  innerType?: AnySchema
  options?: AnySchema[]
}

function getSchemaDef(schema: AnySchema): SchemaDefLike {
  const s = schema as { _zod?: { def?: SchemaDefLike }, def?: SchemaDefLike }
  return s._zod?.def ?? s.def ?? {}
}

function getSchemaMeta(schema: AnySchema) {
  return 'meta' in schema && typeof schema.meta === 'function'
    ? schema.meta()
    : undefined
}

export function defineSteppedForm<const TSteps extends FormStep[]>(
  form: { id: string, steps: TSteps },
) {
  return form as SteppedForm<TSteps>
}
function isSchemaOptional(schema: AnySchema): boolean {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return true
  }
  if (schema instanceof z.ZodDefault) {
    return true
  }
  if (schema instanceof z.ZodPipe) {
    return isSchemaOptional(getSchemaDef(schema).in as AnySchema)
  }
  return false
}

function unwrapSchema(schema: AnySchema): { schema: AnySchema, isArray: boolean } {
  // Strip optionality/nullability wrappers
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapSchema(schema.unwrap() as AnySchema)
  }
  // Strip defaults — field can be omitted, so walk the inner type
  if (schema instanceof z.ZodDefault) {
    return unwrapSchema(getSchemaDef(schema).innerType as AnySchema)
  }
  // Unwrap arrays, recursing into the element type
  if (schema instanceof z.ZodArray) {
    const { schema: inner } = unwrapSchema(schema.element as AnySchema)
    return { schema: inner, isArray: true }
  }
  // Take the first union member as representative
  if (schema instanceof z.ZodUnion) {
    const firstOption = getSchemaDef(schema).options?.[0]
    return firstOption
      ? unwrapSchema(firstOption)
      : { schema, isArray: false }
  }
  // ZodPipe: z.coerce.number() etc. — the meaningful type is on the *out* side
  if (schema instanceof z.ZodPipe) {
    return unwrapSchema(getSchemaDef(schema).out as AnySchema)
  }
  return { schema, isArray: false }
}

const TYPENAME_MAP: Partial<Record<string, FormFieldDef['type']>> = {
  'string': 'text',
  'number': 'number',
  'boolean': 'checkbox',
  'date': 'date',
  'enum': 'select',
  'file': 'file',
  'markdown-value': 'markdown-value',
}

export function deriveFieldsFromSchema(schema: AnySchema): FormFieldDef[] {
  if (!(schema instanceof z.ZodObject)) return []

  const shape = schema.shape as Record<string, AnySchema>

  return Object.entries(shape).map(([name, fieldSchema]) => {
    const { schema: resolved, isArray } = unwrapSchema(fieldSchema)
    const required = !isSchemaOptional(fieldSchema)

    const fieldMeta = getSchemaMeta(fieldSchema)
    const resolvedMeta = getSchemaMeta(resolved)
    const { type, title, description, placeholder, ...meta } = defu(fieldMeta, resolvedMeta)

    const resolvedDef = getSchemaDef(resolved)
    const finalType = fieldMeta?.type ?? type ?? TYPENAME_MAP[resolvedDef.type as string] ?? resolvedDef.type

    if (import.meta.dev) {
      console.log({ name, type: finalType, isArray, required, title, description, placeholder, meta })
    }

    return {
      name,
      type: finalType as FormFieldDef['type'],
      isArray,
      required,
      label: title as string | undefined,
      description: description as string | undefined,
      placeholder: placeholder as string | undefined,
      meta: meta,
    } as FormFieldDef
  })
}

export function deriveSchemaFromSteppedForm<const TSteps extends FormStep[]>(form: SteppedForm<TSteps>) {
  return form.steps.reduce((acc, step) => {
    // @ts-expect-error This is just weak typing...
    return acc.extend(step.schema.shape)
  }, z.object({}))
}
